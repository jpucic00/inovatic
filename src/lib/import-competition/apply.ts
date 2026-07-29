import type { PrismaClient } from '@prisma/client'

import { SKILL_KEYS } from '../assessment-rubric'
import { generateSimplePassword, hashPassword } from '../password'
import type { CompetitionPlan } from './plan'

type ApplyResult = {
  teachersCreated: number
  groupsCreated: number
  assignmentsCreated: number
  studentsCreated: number
  studentsBackfilled: number
  enrollmentsCreated: number
  monthsCreated: number
  monthsMarkedPaid: number
  assessmentsCreated: number
  assessmentsUpdated: number
}

/** Random, never-shown password: the account exists for history, not login.
 *  Credentials become usable only after an explicit admin reset. */
async function unusablePasswordHash(): Promise<string> {
  return hashPassword(generateSimplePassword(24))
}

/**
 * Applies a plan built by {@link buildCompetitionPlan}. Every write is
 * idempotent — re-running the same workbook only fills what a previous run
 * left out.
 */
export async function applyCompetitionPlan(
  db: PrismaClient,
  plan: CompetitionPlan,
  log: (line: string) => void = () => {},
): Promise<ApplyResult> {
  const result: ApplyResult = {
    teachersCreated: 0,
    groupsCreated: 0,
    assignmentsCreated: 0,
    studentsCreated: 0,
    studentsBackfilled: 0,
    enrollmentsCreated: 0,
    monthsCreated: 0,
    monthsMarkedPaid: 0,
    assessmentsCreated: 0,
    assessmentsUpdated: 0,
  }
  const paidAt = new Date()

  await db.schoolYear.upsert({
    where: { label: plan.schoolYear },
    update: {},
    create: { label: plan.schoolYear },
  })

  // ── Staff ──────────────────────────────────────────────────────────────────
  const teacherIds = new Map<string, string>()
  for (const t of plan.teachers) {
    if (t.action === 'match') {
      teacherIds.set(t.key, t.existingId)
      continue
    }
    const existing = await db.user.findUnique({ where: { email: t.email } })
    if (existing) {
      teacherIds.set(t.key, existing.id)
      continue
    }
    const created = await db.user.create({
      data: {
        city: plan.city,
        role: 'TEACHER',
        email: t.email,
        firstName: t.firstName,
        lastName: t.lastName,
        passwordHash: await unusablePasswordHash(),
      },
      select: { id: true },
    })
    teacherIds.set(t.key, created.id)
    result.teachersCreated++
  }
  log(`Staff: ${result.teachersCreated} created, ${plan.teachers.length - result.teachersCreated} matched`)

  // ── Groups + teacher assignments ───────────────────────────────────────────
  const groupIds = new Map<string, string>()
  for (const g of plan.groups) {
    let id = g.existingId ?? null
    if (!id) {
      const existing = await db.scheduledGroup.findFirst({
        where: { schoolYear: plan.schoolYear, city: plan.city, courseId: plan.courseId, name: g.name },
        select: { id: true },
      })
      if (existing) {
        id = existing.id
      } else {
        const created = await db.scheduledGroup.create({
          data: {
            city: plan.city,
            courseId: plan.courseId,
            locationId: plan.locationId,
            name: g.name,
            dayOfWeek: g.slot.dayOfWeek,
            startTime: g.slot.startTime,
            endTime: g.slot.endTime,
            schoolYear: plan.schoolYear,
          },
          select: { id: true },
        })
        id = created.id
        result.groupsCreated++
      }
    }
    groupIds.set(g.key, id)

    // Every mentor and assistant is assigned — teacher attendance and material
    // scoping both hang off the assignment, not off who authored a card.
    for (const teacherKey of g.teacherKeys) {
      const userId = teacherIds.get(teacherKey)
      if (!userId) continue
      const assigned = await db.teacherAssignment.findUnique({
        where: { userId_scheduledGroupId: { userId, scheduledGroupId: id } },
      })
      if (!assigned) {
        await db.teacherAssignment.create({ data: { userId, scheduledGroupId: id } })
        result.assignmentsCreated++
      }
    }
  }
  log(`Groups: ${result.groupsCreated} created, ${plan.groups.length - result.groupsCreated} matched`)

  // ── Students ───────────────────────────────────────────────────────────────
  const studentIds = new Map<string, string>()
  for (const s of plan.students) {
    if (s.action === 'match') {
      studentIds.set(s.key, s.existingId)
      const current = await db.user.findUnique({
        where: { id: s.existingId },
        select: { parentName: true, parentEmail: true, parentPhone: true, dateOfBirth: true },
      })
      if (current) {
        const backfill: Record<string, string> = {}
        if (!current.parentName && s.parentName) backfill.parentName = s.parentName
        // Empty OR Outlook-residue ("Name <a@b>") emails get the sanitized value.
        const dirtyEmail = current.parentEmail?.includes('<') ?? false
        if ((!current.parentEmail || dirtyEmail) && s.parentEmail) backfill.parentEmail = s.parentEmail
        if (!current.parentPhone && s.parentPhone) backfill.parentPhone = s.parentPhone
        // Filling a DOB graduates the account from the legacy name+e-mail match
        // tier to the strict one — never overwrite one that is already set.
        if (!current.dateOfBirth && s.dateOfBirth) backfill.dateOfBirth = s.dateOfBirth
        if (Object.keys(backfill).length > 0) {
          await db.user.update({ where: { id: s.existingId }, data: backfill })
          result.studentsBackfilled++
        }
      }
      continue
    }

    const existing = await db.user.findUnique({ where: { email: s.email }, select: { id: true } })
    if (existing) {
      studentIds.set(s.key, existing.id)
      continue
    }
    const created = await db.user.create({
      data: {
        city: plan.city,
        role: 'STUDENT',
        email: s.email,
        username: s.username,
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dateOfBirth,
        parentName: s.parentName,
        parentEmail: s.parentEmail,
        parentPhone: s.parentPhone,
        passwordHash: await unusablePasswordHash(),
      },
      select: { id: true },
    })
    studentIds.set(s.key, created.id)
    result.studentsCreated++
  }
  log(`Students: ${result.studentsCreated} created, ${result.studentsBackfilled} backfilled`)

  // ── Enrollments + their monthly fees ───────────────────────────────────────
  // The program is monthly-billed, and this is a year that has already been
  // paid for: every month of the season is written, already settled.
  for (const e of plan.enrollments) {
    const userId = studentIds.get(e.studentKey)
    const scheduledGroupId = groupIds.get(e.groupKey)
    if (!userId || !scheduledGroupId) continue

    const where = {
      userId_scheduledGroupId_schoolYear: { userId, scheduledGroupId, schoolYear: plan.schoolYear },
    }
    const existing = await db.enrollment.findUnique({ where, select: { id: true } })
    const enrollmentId =
      existing?.id ??
      (await db.enrollment.create({
        data: { userId, scheduledGroupId, schoolYear: plan.schoolYear },
        select: { id: true },
      })).id
    if (!existing) result.enrollmentsCreated++

    if (plan.seasonMonths.length > 0) {
      const created = await db.enrollmentMonth.createMany({
        data: plan.seasonMonths.map((periodStart) => ({ enrollmentId, periodStart, paidAt })),
        skipDuplicates: true,
      })
      result.monthsCreated += created.count
      // Months a previous run (or the app) left owed are settled too.
      const settled = await db.enrollmentMonth.updateMany({
        where: { enrollmentId, paidAt: null },
        data: { paidAt },
      })
      result.monthsMarkedPaid += created.count + settled.count
    }
  }
  log(
    `Enrollments: ${result.enrollmentsCreated} created, ` +
      `${result.monthsCreated} months written (${result.monthsMarkedPaid} marked paid)`,
  )

  // ── Report cards ───────────────────────────────────────────────────────────
  for (const a of plan.assessments) {
    const studentId = studentIds.get(a.studentKey)
    const groupId = groupIds.get(a.groupKey)
    const authorId = teacherIds.get(a.authorKey)
    if (!studentId || !groupId || !authorId) continue

    // Every rubric column is written explicitly, the SLR ones as null: a
    // competition card must never carry a `slaganje` value, and an `undefined`
    // would silently leave a stale one in place on update.
    const skills = Object.fromEntries(SKILL_KEYS.map((key) => [key, a.skills[key] ?? null]))
    const data = {
      authorId,
      ...skills,
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
  log(`Report cards: ${result.assessmentsCreated} created, ${result.assessmentsUpdated} updated`)

  return result
}
