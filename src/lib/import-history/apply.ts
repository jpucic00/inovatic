import type { PrismaClient } from '@prisma/client'

import { generateSimplePassword, hashPassword } from '../password'
import type { ImportPlan } from './plan'

type ApplyResult = {
  teachersCreated: number
  groupsCreated: number
  assignmentsCreated: number
  studentsCreated: number
  studentsBackfilled: number
  enrollmentsCreated: number
  paidMarked: number
  assessmentsCreated: number
  assessmentsUpdated: number
}

/** Random, never-shown password: the account exists for history, not login.
 *  Credentials become usable only after an explicit admin reset. */
async function unusablePasswordHash(): Promise<string> {
  return hashPassword(generateSimplePassword(24))
}

/**
 * Applies a plan built by {@link buildImportPlan}. Every write is idempotent —
 * re-running the same workbook only fills whatever a previous run left out.
 */
export async function applyImportPlan(
  db: PrismaClient,
  plan: ImportPlan,
  log: (line: string) => void = () => {},
): Promise<ApplyResult> {
  const result: ApplyResult = {
    teachersCreated: 0,
    groupsCreated: 0,
    assignmentsCreated: 0,
    studentsCreated: 0,
    studentsBackfilled: 0,
    enrollmentsCreated: 0,
    paidMarked: 0,
    assessmentsCreated: 0,
    assessmentsUpdated: 0,
  }

  await db.schoolYear.upsert({
    where: { label: plan.schoolYear },
    update: {},
    create: { label: plan.schoolYear },
  })

  // ── Teachers ───────────────────────────────────────────────────────────────
  const teacherIds = new Map<string, string>()
  for (const t of plan.teachers) {
    if (t.action === 'match') {
      teacherIds.set(t.key, t.existingId!)
      continue
    }
    const existing = await db.user.findUnique({ where: { email: t.email! } })
    if (existing) {
      teacherIds.set(t.key, existing.id)
      continue
    }
    const created = await db.user.create({
      data: {
        city: 'SPLIT',
        role: 'TEACHER',
        email: t.email!,
        firstName: t.firstName,
        lastName: t.lastName,
        passwordHash: await unusablePasswordHash(),
      },
      select: { id: true },
    })
    teacherIds.set(t.key, created.id)
    result.teachersCreated++
  }
  log(`Teachers: ${result.teachersCreated} created, ${plan.teachers.length - result.teachersCreated} matched`)

  // ── Groups + teacher assignments ───────────────────────────────────────────
  const groupIds = new Map<string, string>()
  for (const g of plan.groups) {
    let id = g.existingId ?? null
    if (!id) {
      const existing = await db.scheduledGroup.findFirst({
        where: { schoolYear: plan.schoolYear, city: 'SPLIT', name: g.name },
        select: { id: true },
      })
      if (existing) {
        id = existing.id
      } else {
        const created = await db.scheduledGroup.create({
          data: {
            city: 'SPLIT',
            courseId: g.courseId,
            locationId: plan.locationId,
            name: g.name,
            dayOfWeek: g.identity.dayOfWeek,
            startTime: g.identity.startTime,
            endTime: g.identity.endTime,
            schoolYear: plan.schoolYear,
          },
          select: { id: true },
        })
        id = created.id
        result.groupsCreated++
      }
    }
    groupIds.set(g.key, id)

    const teacherId = g.teacherKey ? teacherIds.get(g.teacherKey) : null
    if (teacherId) {
      const assignmentWhere = {
        userId_scheduledGroupId: { userId: teacherId, scheduledGroupId: id },
      }
      const assigned = await db.teacherAssignment.findUnique({ where: assignmentWhere })
      if (!assigned) {
        await db.teacherAssignment.create({
          data: { userId: teacherId, scheduledGroupId: id },
        })
        result.assignmentsCreated++
      }
    }
  }
  log(`Groups: ${result.groupsCreated} created, ${plan.groups.length - result.groupsCreated} matched`)

  // ── Students ───────────────────────────────────────────────────────────────
  const studentIds = new Map<string, string>()
  for (const s of plan.students) {
    if (s.action === 'match') {
      studentIds.set(s.key, s.existingId!)
      const current = await db.user.findUnique({
        where: { id: s.existingId! },
        select: { parentName: true, parentEmail: true, parentPhone: true },
      })
      if (current) {
        const backfill: Record<string, string> = {}
        if (!current.parentName && s.parentName) backfill.parentName = s.parentName
        // Empty OR Outlook-residue ("Name <a@b>") emails get the sanitized
        // value — earlier imports ran before MAIL cells were cleaned up.
        const dirtyEmail = current.parentEmail?.includes('<') ?? false
        if ((!current.parentEmail || dirtyEmail) && s.parentEmail) {
          backfill.parentEmail = s.parentEmail
        }
        if (!current.parentPhone && s.parentPhone) backfill.parentPhone = s.parentPhone
        if (Object.keys(backfill).length > 0) {
          await db.user.update({ where: { id: s.existingId! }, data: backfill })
          result.studentsBackfilled++
        }
      }
      continue
    }

    const existing = await db.user.findUnique({ where: { email: s.email! }, select: { id: true } })
    if (existing) {
      studentIds.set(s.key, existing.id)
      continue
    }
    const created = await db.user.create({
      data: {
        city: 'SPLIT',
        role: 'STUDENT',
        email: s.email!,
        username: s.username!,
        firstName: s.firstName,
        lastName: s.lastName,
        parentName: s.parentName,
        parentEmail: s.parentEmail,
        parentPhone: s.parentPhone,
        passwordHash: await unusablePasswordHash(),
      },
      select: { id: true },
    })
    studentIds.set(s.key, created.id)
    result.studentsCreated++
    if (result.studentsCreated % 20 === 0) log(`  …${result.studentsCreated} students created`)
  }
  log(`Students: ${result.studentsCreated} created, ${result.studentsBackfilled} backfilled`)

  // ── Enrollments (+ full-year paid marks) ───────────────────────────────────
  for (const e of plan.enrollments) {
    const userId = studentIds.get(e.studentKey)
    const scheduledGroupId = groupIds.get(e.groupKey)
    if (!userId || !scheduledGroupId) continue

    const where = {
      userId_scheduledGroupId_schoolYear: {
        userId, scheduledGroupId, schoolYear: plan.schoolYear,
      },
    }
    const existing = await db.enrollment.findUnique({ where, select: { id: true, fullYearPaidAt: true } })
    if (!existing) {
      await db.enrollment.create({
        data: {
          userId,
          scheduledGroupId,
          schoolYear: plan.schoolYear,
          fullYearPaidAt: e.paid ? new Date() : null,
        },
      })
      result.enrollmentsCreated++
      if (e.paid) result.paidMarked++
    } else if (e.paid && !existing.fullYearPaidAt) {
      await db.enrollment.update({
        where: { id: existing.id },
        data: { fullYearPaidAt: new Date() },
      })
      result.paidMarked++
    }
  }
  log(`Enrollments: ${result.enrollmentsCreated} created, ${result.paidMarked} marked paid`)

  // ── Assessments ────────────────────────────────────────────────────────────
  for (const a of plan.assessments) {
    const studentId = studentIds.get(a.studentKey)
    const groupId = groupIds.get(a.groupKey)
    const authorId = teacherIds.get(a.authorKey)
    if (!studentId || !groupId || !authorId) continue

    const data = {
      authorId,
      ...a.skills,
      opisnaOcjena: a.opisnaOcjena,
      recommendationKind: a.recommendationKind,
      recommendedCourseId: a.recommendedCourseId,
    }
    const existing = await db.studentAssessment.findUnique({
      where: { studentId_groupId: { studentId, groupId } },
      select: { id: true },
    })
    if (existing) {
      await db.studentAssessment.update({ where: { id: existing.id }, data })
      result.assessmentsUpdated++
    } else {
      await db.studentAssessment.create({ data: { studentId, groupId, ...data } })
      result.assessmentsCreated++
    }
  }
  log(`Assessments: ${result.assessmentsCreated} created, ${result.assessmentsUpdated} updated`)

  return result
}
