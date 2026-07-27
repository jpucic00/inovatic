import type { RecommendationKind, SkillLevel } from '@prisma/client'

import type { SkillKey } from '../assessment-rubric'
import {
  buildGroupName,
  identityKey,
  parseGroupName,
  personKey,
  stripDiacritics,
  titleCaseName,
  type ContactSheet,
  type EvaluationBlock,
  type GroupIdentity,
  type ImportWarning,
} from './parse'

// ── Snapshot of the target DB (read by the caller, kept plain for tests) ─────

export type DbSnapshot = {
  schoolYear: string
  location: { id: string; name: string }
  courses: { id: string; slug: string }[]
  /** Existing groups for (schoolYear, SPLIT) — names parsed for identity match. */
  groups: { id: string; name: string | null }[]
  /** TEACHER + ADMIN users in SPLIT (teacher matching pool). */
  staff: { id: string; firstName: string; lastName: string }[]
  /** STUDENT users in SPLIT (student matching pool). */
  students: { id: string; firstName: string; lastName: string; parentEmail: string | null }[]
  /** Every taken username and email (uniqueness for synthesized credentials). */
  usernames: string[]
  emails: string[]
}

// ── Plan model ───────────────────────────────────────────────────────────────

export type PlannedTeacher = {
  key: string
  firstName: string
  lastName: string
  action: 'match' | 'create'
  existingId?: string
  email?: string
}

export type PlannedGroup = {
  key: string
  tabName: string
  name: string
  action: 'match' | 'create'
  existingId?: string
  identity: GroupIdentity
  courseId: string
  teacherKey: string | null
}

export type PlannedStudent = {
  key: string
  firstName: string
  lastName: string
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
  action: 'match' | 'create'
  existingId?: string
  username?: string
  email?: string
}

export type PlannedEnrollment = { studentKey: string; groupKey: string; paid: boolean }

export type PlannedAssessment = {
  studentKey: string
  groupKey: string
  authorKey: string
  skills: Record<SkillKey, SkillLevel | null>
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
  recommendedCourseId: string | null
}

export type ImportPlan = {
  schoolYear: string
  locationId: string
  teachers: PlannedTeacher[]
  groups: PlannedGroup[]
  students: PlannedStudent[]
  enrollments: PlannedEnrollment[]
  assessments: PlannedAssessment[]
  warnings: ImportWarning[]
}

// ── Credential synthesis (mirrors src/actions/admin/student.ts) ──────────────

function usernameBase(firstName: string, lastName: string): string {
  return stripDiacritics(`${firstName}${lastName}`)
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^a-z0-9]/g, '')
}

function claimUnique(base: string, taken: Set<string>): string {
  let candidate = base
  let suffix = 2
  while (taken.has(candidate)) candidate = `${base}${suffix++}`
  taken.add(candidate)
  return candidate
}

// ── Teacher registry ─────────────────────────────────────────────────────────

function splitTeacherName(full: string): { firstName: string; lastName: string } {
  const parts = titleCaseName(full).split(' ')
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

class TeacherRegistry {
  private readonly byKey = new Map<string, PlannedTeacher>()

  constructor(
    private readonly snapshot: DbSnapshot,
    private readonly takenEmails: Set<string>,
    private readonly warnings: ImportWarning[],
  ) {}

  /** Resolve a sheet teacher name to a planned teacher key (match or create). */
  resolve(fullName: string, where: string): string | null {
    const { firstName, lastName } = splitTeacherName(fullName)
    if (!firstName || !lastName) {
      this.warnings.push({
        level: 'error',
        where,
        message: `Teacher name "${fullName}" needs both first and last name — left unresolved`,
      })
      return null
    }
    const key = personKey(firstName, lastName)
    const existing = this.byKey.get(key)
    if (existing) return key

    const matches = this.snapshot.staff.filter(
      (s) => personKey(s.firstName, s.lastName) === key,
    )
    if (matches.length > 1) {
      this.warnings.push({
        level: 'error',
        where,
        message: `Teacher "${fullName}" matches ${matches.length} staff accounts — left unresolved, map manually`,
      })
      return null
    }
    if (matches.length === 1) {
      this.byKey.set(key, {
        key, firstName, lastName, action: 'match', existingId: matches[0].id,
      })
      return key
    }

    const email = `${claimUnique(usernameBase(firstName, lastName), this.takenEmails)}@teacher.inovatic.local`
    this.byKey.set(key, { key, firstName, lastName, action: 'create', email })
    this.warnings.push({
      level: 'info',
      where,
      message: `Teacher "${firstName} ${lastName}" not found — account will be created with placeholder email ${email}`,
    })
    return key
  }

  all(): PlannedTeacher[] {
    return [...this.byKey.values()]
  }
}

// ── Student registry ─────────────────────────────────────────────────────────

class StudentRegistry {
  private readonly byKey = new Map<string, PlannedStudent>()

  constructor(
    private readonly snapshot: DbSnapshot,
    private readonly takenUsernames: Set<string>,
    private readonly takenEmails: Set<string>,
    private readonly warnings: ImportWarning[],
  ) {}

  resolve(
    row: {
      firstName: string
      lastName: string
      parentName?: string | null
      parentEmail?: string | null
      parentPhone?: string | null
    },
    where: string,
  ): string | null {
    if (!row.firstName || !row.lastName) {
      this.warnings.push({
        level: 'error',
        where,
        message: `Student row with missing name ("${row.firstName}" "${row.lastName}") — skipped`,
      })
      return null
    }
    const key = personKey(row.firstName, row.lastName)
    const existing = this.byKey.get(key)
    if (existing) {
      // Same name seen in another sheet: same child unless parent emails disagree.
      if (
        existing.parentEmail && row.parentEmail &&
        existing.parentEmail !== row.parentEmail
      ) {
        this.warnings.push({
          level: 'error',
          where,
          message: `"${row.firstName} ${row.lastName}" appears with two different parent emails (${existing.parentEmail} vs ${row.parentEmail}) — treated as the SAME child; fix manually if they are two kids`,
        })
      }
      existing.parentName ??= row.parentName ?? null
      existing.parentEmail ??= row.parentEmail ?? null
      existing.parentPhone ??= row.parentPhone ?? null
      return key
    }

    const matches = this.snapshot.students.filter(
      (s) => personKey(s.firstName, s.lastName) === key,
    )
    if (matches.length > 1) {
      this.warnings.push({
        level: 'error',
        where,
        message: `"${row.firstName} ${row.lastName}" matches ${matches.length} existing students — skipped, resolve manually`,
      })
      return null
    }

    const base: Omit<PlannedStudent, 'action'> = {
      key,
      firstName: row.firstName,
      lastName: row.lastName,
      parentName: row.parentName ?? null,
      parentEmail: row.parentEmail ?? null,
      parentPhone: row.parentPhone ?? null,
    }
    if (matches.length === 1) {
      this.byKey.set(key, { ...base, action: 'match', existingId: matches[0].id })
    } else {
      const username = claimUnique(usernameBase(row.firstName, row.lastName), this.takenUsernames)
      const email = claimUnique(`${username}@student.inovatic.local`, this.takenEmails)
      this.byKey.set(key, { ...base, action: 'create', username, email })
    }
    return key
  }

  all(): PlannedStudent[] {
    return [...this.byKey.values()]
  }
}

// ── Plan builder ─────────────────────────────────────────────────────────────

export function buildImportPlan(
  contactSheets: ContactSheet[],
  evaluationBlocks: EvaluationBlock[],
  snapshot: DbSnapshot,
  parseWarnings: ImportWarning[],
): ImportPlan {
  const warnings: ImportWarning[] = [...parseWarnings]
  const takenUsernames = new Set(snapshot.usernames)
  const takenEmails = new Set(snapshot.emails)
  const teachers = new TeacherRegistry(snapshot, takenEmails, warnings)
  const students = new StudentRegistry(snapshot, takenUsernames, takenEmails, warnings)
  const courseBySlug = new Map(snapshot.courses.map((c) => [c.slug, c]))

  // Existing groups parsed once by the same naming convention.
  const existingByIdentity = new Map<string, { id: string; name: string | null }[]>()
  const existingByCourseDay = new Map<string, { id: string; name: string | null }[]>()
  for (const g of snapshot.groups) {
    const identity = g.name ? parseGroupName(g.name) : null
    if (!identity) continue
    const push = (map: Map<string, { id: string; name: string | null }[]>, k: string) => {
      const list = map.get(k) ?? []
      list.push(g)
      map.set(k, list)
    }
    push(existingByIdentity, identityKey(identity))
    push(existingByCourseDay, `${identity.courseSlug}|${identity.dayOfWeek}`)
  }

  const groups: PlannedGroup[] = []
  const enrollments: PlannedEnrollment[] = []
  const assessments: PlannedAssessment[] = []
  const groupByCourseDay = new Map<string, PlannedGroup[]>()

  // ── 1. Contact tabs define the groups + rosters + paid flags ───────────────
  for (const sheet of contactSheets) {
    const where = `contact sheet "${sheet.tabName}"`
    const course = courseBySlug.get(sheet.identity.courseSlug)
    if (!course) {
      warnings.push({
        level: 'error',
        where,
        message: `Course "${sheet.identity.courseToken}" (slug ${sheet.identity.courseSlug}) not found in the database — sheet skipped`,
      })
      continue
    }

    const key = identityKey(sheet.identity)
    const exact = existingByIdentity.get(key) ?? []
    const sameDay = existingByCourseDay.get(`${sheet.identity.courseSlug}|${sheet.identity.dayOfWeek}`) ?? []

    let planned: PlannedGroup
    if (exact.length > 1) {
      warnings.push({
        level: 'error',
        where,
        message: `${exact.length} existing groups share identity ${key} — sheet skipped, merge them first`,
      })
      continue
    }
    const teacherKey = sheet.teacherName ? teachers.resolve(sheet.teacherName, where) : null
    if (exact.length === 1) {
      planned = {
        key, tabName: sheet.tabName, name: exact[0].name ?? buildGroupName(sheet.identity),
        action: 'match', existingId: exact[0].id,
        identity: sheet.identity, courseId: course.id, teacherKey,
      }
    } else {
      if (sameDay.length > 0) {
        warnings.push({
          level: 'warn',
          where,
          message: `Existing group "${sameDay[0].name}" has the same course+day but a different time — creating a separate group; merge manually if they are the same`,
        })
      }
      planned = {
        key, tabName: sheet.tabName, name: buildGroupName(sheet.identity),
        action: 'create',
        identity: sheet.identity, courseId: course.id, teacherKey,
      }
    }
    groups.push(planned)
    const cdKey = `${sheet.identity.courseSlug}|${sheet.identity.dayOfWeek}`
    groupByCourseDay.set(cdKey, [...(groupByCourseDay.get(cdKey) ?? []), planned])

    const seenInSheet = new Set<string>()
    for (const row of sheet.rows) {
      const studentKey = students.resolve(row, where)
      if (!studentKey) continue
      if (seenInSheet.has(studentKey)) {
        warnings.push({
          level: 'error',
          where,
          message: `"${row.firstName} ${row.lastName}" appears twice in this sheet — second row skipped`,
        })
        continue
      }
      seenInSheet.add(studentKey)
      enrollments.push({ studentKey, groupKey: planned.key, paid: row.paid })
    }
  }

  // ── 2. Evaluation blocks attach assessments to those groups ────────────────
  for (const block of evaluationBlocks) {
    const where = `evaluation "${block.programLabel} / ${block.groupLabel || '?'}"`
    if (!block.courseSlug || !block.dayOfWeek) continue // parse already errored

    const candidates = groupByCourseDay.get(`${block.courseSlug}|${block.dayOfWeek}`) ?? []
    if (candidates.length === 0) {
      warnings.push({
        level: 'error',
        where,
        message: 'No contact tab matches this course+day — block skipped (groups are created from contact tabs)',
      })
      continue
    }
    if (candidates.length > 1) {
      warnings.push({
        level: 'error',
        where,
        message: `${candidates.length} groups share this course+day (${candidates.map((c) => c.name).join(', ')}) — block skipped, cannot tell which one is graded`,
      })
      continue
    }
    const group = candidates[0]

    const authorKey = block.teacherName
      ? teachers.resolve(block.teacherName, where)
      : group.teacherKey
    if (!authorKey) {
      warnings.push({
        level: 'error',
        where,
        message: 'No PREDAVAČ on the block and no TRENER on the contact tab — assessments skipped (author is required)',
      })
      continue
    }

    const rosterKeys = new Set(
      enrollments.filter((e) => e.groupKey === group.key).map((e) => e.studentKey),
    )
    for (const row of block.rows) {
      const studentKey = students.resolve(row, where)
      if (!studentKey) continue
      if (!rosterKeys.has(studentKey)) {
        warnings.push({
          level: 'warn',
          where,
          message: `"${row.firstName} ${row.lastName}" is graded but missing from the contact tab — enrolling without parent contact/paid data`,
        })
        enrollments.push({ studentKey, groupKey: group.key, paid: false })
        rosterKeys.add(studentKey)
      }

      const hasContent =
        Object.values(row.skills).some((v) => v !== null) ||
        row.opisnaOcjena !== null ||
        row.recommendation !== null
      if (!hasContent) continue

      let recommendationKind: RecommendationKind | null = null
      let recommendedCourseId: string | null = null
      if (row.recommendation) {
        recommendationKind = row.recommendation.kind
        if (row.recommendation.kind === 'COURSE') {
          const rec = courseBySlug.get(row.recommendation.courseSlug)
          if (rec) {
            recommendedCourseId = rec.id
          } else {
            warnings.push({
              level: 'warn',
              where,
              message: `"${row.firstName} ${row.lastName}": recommended course ${row.recommendation.courseSlug} not in the database — recommendation dropped`,
            })
            recommendationKind = null
          }
        }
      }

      assessments.push({
        studentKey,
        groupKey: group.key,
        authorKey,
        skills: row.skills,
        opisnaOcjena: row.opisnaOcjena,
        recommendationKind,
        recommendedCourseId,
      })
    }
  }

  return {
    schoolYear: snapshot.schoolYear,
    locationId: snapshot.location.id,
    teachers: teachers.all(),
    groups,
    students: students.all(),
    enrollments,
    assessments,
    warnings,
  }
}
