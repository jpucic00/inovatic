import type { City, RecommendationKind, SkillLevel } from '@prisma/client'

import type { SkillKey } from '../assessment-rubric'
import { claimUnique, usernameBase } from '../import-common/credentials'
import { personKey, titleCaseName, type ImportWarning } from '../import-common/grid'
import { normalizeTimeToken } from '../import-common/values'
import {
  slotKey,
  type CompetitionEvaluationBlock,
  type CompetitionGroupSheet,
  type GroupSlot,
} from './parse'

// ── Snapshot of the target DB (read by the caller, kept plain for tests) ─────

export type CompetitionSnapshot = {
  schoolYear: string
  city: City
  location: { id: string; name: string }
  competitionCourseId: string
  /** Every month of the program's season — all written already paid. */
  seasonMonths: Date[]
  /** The season row itself, for reporting. Null when the year is unplanned. */
  season: { startDate: Date | null; endDate: Date | null } | null
  /** Standard SLR courses, for COURSE preporuke. */
  courses: { id: string; slug: string }[]
  /** Existing competition groups for (schoolYear, city). */
  groups: { id: string; name: string | null; dayOfWeek: string | null; startTime: string | null }[]
  /** TEACHER + ADMIN users in the city (staff matching pool). */
  staff: { id: string; firstName: string; lastName: string }[]
  /** STUDENT users in the city (student matching pool). */
  students: { id: string; firstName: string; lastName: string; dateOfBirth: string | null }[]
  /** Every taken username and email (uniqueness for synthesized credentials). */
  usernames: string[]
  emails: string[]
}

// ── Plan model ───────────────────────────────────────────────────────────────

export type PlannedTeacher = {
  key: string
  firstName: string
  lastName: string
} & ({ action: 'match'; existingId: string } | { action: 'create'; email: string })

export type PlannedGroup = {
  key: string
  tabName: string
  name: string
  action: 'match' | 'create'
  existingId?: string
  slot: GroupSlot
  /** Mentor 1, mentor 2, asistent — all assigned; the first is the card author. */
  teacherKeys: string[]
}

export type PlannedStudent = {
  key: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
} & (
  | { action: 'match'; existingId: string }
  | { action: 'create'; username: string; email: string }
)

export type PlannedEnrollment = { studentKey: string; groupKey: string }

export type PlannedAssessment = {
  studentKey: string
  groupKey: string
  authorKey: string
  skills: Record<SkillKey, SkillLevel | null>
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
  recommendedCourseId: string | null
}

export type CompetitionPlan = {
  schoolYear: string
  city: City
  locationId: string
  courseId: string
  seasonMonths: Date[]
  teachers: PlannedTeacher[]
  groups: PlannedGroup[]
  students: PlannedStudent[]
  enrollments: PlannedEnrollment[]
  assessments: PlannedAssessment[]
  warnings: ImportWarning[]
}

// ── Teacher registry ─────────────────────────────────────────────────────────

function splitTeacherName(full: string): { firstName: string; lastName: string } {
  const parts = titleCaseName(full).split(' ')
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

class TeacherRegistry {
  private readonly byKey = new Map<string, PlannedTeacher>()

  constructor(
    private readonly snapshot: CompetitionSnapshot,
    private readonly takenEmails: Set<string>,
    private readonly warnings: ImportWarning[],
  ) {}

  /** Resolve a sheet mentor/assistant name to a planned teacher key. */
  resolve(fullName: string, where: string): string | null {
    const { firstName, lastName } = splitTeacherName(fullName)
    if (!firstName || !lastName) {
      this.warnings.push({
        level: 'error',
        where,
        message: `Staff name "${fullName}" needs both first and last name — left unresolved`,
      })
      return null
    }
    const key = personKey(firstName, lastName)
    if (this.byKey.has(key)) return key

    const matches = this.snapshot.staff.filter((s) => personKey(s.firstName, s.lastName) === key)
    if (matches.length > 1) {
      this.warnings.push({
        level: 'error',
        where,
        message: `Staff "${fullName}" matches ${matches.length} accounts — left unresolved, map manually`,
      })
      return null
    }
    if (matches.length === 1) {
      this.byKey.set(key, { key, firstName, lastName, action: 'match', existingId: matches[0].id })
      return key
    }

    const email = `${claimUnique(usernameBase(firstName, lastName), this.takenEmails)}@teacher.inovatic.local`
    this.byKey.set(key, { key, firstName, lastName, action: 'create', email })
    this.warnings.push({
      level: 'info',
      where,
      message: `Staff "${firstName} ${lastName}" not found — account will be created with placeholder email ${email}`,
    })
    return key
  }

  all(): PlannedTeacher[] {
    return [...this.byKey.values()]
  }
}

// ── Student registry ─────────────────────────────────────────────────────────

type StudentRowInput = {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  parentName?: string | null
  parentEmail?: string | null
  parentPhone?: string | null
}

/**
 * Matching is by NAME, not by the app's strict name+DOB rule, and deliberately:
 * these children overwhelmingly already exist as DOB-less accounts created by
 * the SLR workbook import, and a second account for the same child is a far
 * worse outcome than a missed DOB. A disagreeing DOB is reported instead.
 */
class StudentRegistry {
  private readonly byKey = new Map<string, PlannedStudent>()

  constructor(
    private readonly snapshot: CompetitionSnapshot,
    private readonly takenUsernames: Set<string>,
    private readonly takenEmails: Set<string>,
    private readonly warnings: ImportWarning[],
  ) {}

  resolve(row: StudentRowInput, where: string): string | null {
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
      existing.dateOfBirth ??= row.dateOfBirth ?? null
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

    const base = {
      key,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth ?? null,
      parentName: row.parentName ?? null,
      parentEmail: row.parentEmail ?? null,
      parentPhone: row.parentPhone ?? null,
    }
    if (matches.length === 1) {
      const found = matches[0]
      if (found.dateOfBirth && row.dateOfBirth && found.dateOfBirth !== row.dateOfBirth) {
        this.warnings.push({
          level: 'error',
          where,
          message: `"${row.firstName} ${row.lastName}" already exists with date of birth ${found.dateOfBirth}, the workbook says ${row.dateOfBirth} — treated as the SAME child and the stored DOB is kept; check whether these are two children`,
        })
      }
      this.byKey.set(key, { ...base, action: 'match', existingId: found.id })
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

// ── Group naming ─────────────────────────────────────────────────────────────

/** Prod names competition groups "WRO – srijedom", so a disambiguating suffix
 *  uses the same instrumental form. */
const DAY_INSTRUMENTAL: Record<string, string> = {
  Ponedjeljak: 'ponedjeljkom', Utorak: 'utorkom', Srijeda: 'srijedom',
  Četvrtak: 'četvrtkom', Petak: 'petkom', Subota: 'subotom', Nedjelja: 'nedjeljom',
}

function dayLabel(dayOfWeek: string): string {
  return DAY_INSTRUMENTAL[dayOfWeek] ?? dayOfWeek.toLowerCase()
}

/**
 * The group's name is the team written on its own tab (`PRIPREME ZA
 * NATJECANJA`), verbatim — that is the only place the team is recorded, and it
 * is what staff call the group.
 *
 * Identity for match/create is the (day, time) slot, so several tabs may
 * legitimately carry the same team name; three groups all called `FLL` would be
 * indistinguishable in the admin, so a name used by more than one tab gets its
 * weekday appended. A name used once is left exactly as written.
 */
function groupNameFor(sheet: CompetitionGroupSheet, duplicated: ReadonlySet<string>): string {
  if (!sheet.teamLabel) return `Natjecateljski program – ${dayLabel(sheet.slot.dayOfWeek)}`
  if (!duplicated.has(sheet.teamLabel)) return sheet.teamLabel
  return `${sheet.teamLabel} – ${dayLabel(sheet.slot.dayOfWeek)}`
}

/** Team names claimed by more than one tab. */
function duplicatedTeamLabels(sheets: CompetitionGroupSheet[]): Set<string> {
  const counts = new Map<string, number>()
  for (const s of sheets) {
    if (s.teamLabel) counts.set(s.teamLabel, (counts.get(s.teamLabel) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([label]) => label))
}

// ── Plan builder ─────────────────────────────────────────────────────────────

export function buildCompetitionPlan(
  groupSheets: CompetitionGroupSheet[],
  evaluationBlocks: CompetitionEvaluationBlock[],
  snapshot: CompetitionSnapshot,
  parseWarnings: ImportWarning[],
): CompetitionPlan {
  const warnings: ImportWarning[] = [...parseWarnings]
  const teachers = new TeacherRegistry(snapshot, new Set(snapshot.emails), warnings)
  const students = new StudentRegistry(
    snapshot,
    new Set(snapshot.usernames),
    new Set(snapshot.emails),
    warnings,
  )
  const courseBySlug = new Map(snapshot.courses.map((c) => [c.slug, c]))

  const groups: PlannedGroup[] = []
  const enrollments: PlannedEnrollment[] = []
  const assessments: PlannedAssessment[] = []
  const groupsByDay = new Map<string, PlannedGroup[]>()
  const duplicated = duplicatedTeamLabels(groupSheets)

  // ── 1. Group tabs define the groups + rosters + staff ──────────────────────
  for (const sheet of groupSheets) {
    const where = `group tab "${sheet.tabName}"`
    const key = slotKey(sheet.slot)

    const sameDay = snapshot.groups.filter((g) => g.dayOfWeek === sheet.slot.dayOfWeek)
    // A tab without a time can only be matched on its weekday.
    const exact = sheet.slot.startTime
      ? sameDay.filter((g) => normalizeTimeToken(g.startTime ?? '') === sheet.slot.startTime)
      : sameDay

    if (exact.length > 1) {
      warnings.push({
        level: 'error',
        where,
        message: `${exact.length} existing groups match ${sheet.slot.dayOfWeek} ${sheet.slot.startTime ?? '(any time)'} (${exact.map((g) => g.name).join(', ')}) — tab skipped, disambiguate in the admin first`,
      })
      continue
    }

    const name = groupNameFor(sheet, duplicated)
    if (sheet.teamLabel && duplicated.has(sheet.teamLabel)) {
      warnings.push({
        level: 'info',
        where,
        message: `Team "${sheet.teamLabel}" is used by more than one tab — this group is named "${name}" so the two can be told apart in the admin`,
      })
    }

    const teacherKeys = sheet.staffNames
      .map((n) => teachers.resolve(n, where))
      .filter((k): k is string => k !== null)

    let planned: PlannedGroup
    if (exact.length === 1) {
      planned = {
        key, tabName: sheet.tabName, name: exact[0].name ?? name,
        action: 'match', existingId: exact[0].id, slot: sheet.slot, teacherKeys,
      }
    } else {
      if (sameDay.length > 0) {
        warnings.push({
          level: 'warn',
          where,
          message: `Existing group "${sameDay[0].name}" runs on the same day at a different time — creating a separate group; merge manually if they are the same`,
        })
      }
      planned = {
        key, tabName: sheet.tabName, name, action: 'create', slot: sheet.slot, teacherKeys,
      }
    }
    groups.push(planned)
    groupsByDay.set(sheet.slot.dayOfWeek, [...(groupsByDay.get(sheet.slot.dayOfWeek) ?? []), planned])

    const seenInSheet = new Set<string>()
    for (const row of sheet.rows) {
      const studentKey = students.resolve(row, where)
      if (!studentKey) continue
      if (seenInSheet.has(studentKey)) {
        warnings.push({
          level: 'error',
          where,
          message: `"${row.firstName} ${row.lastName}" appears twice on this tab — second row skipped`,
        })
        continue
      }
      seenInSheet.add(studentKey)
      enrollments.push({ studentKey, groupKey: planned.key })
    }
  }

  // ── 2. Evaluation blocks attach report cards to those groups ───────────────
  for (const block of evaluationBlocks) {
    const where = `evaluation block "${block.groupLabel || '?'}"`
    if (!block.dayOfWeek) continue // parse already errored

    const candidates = groupsByDay.get(block.dayOfWeek) ?? []
    if (candidates.length === 0) {
      warnings.push({
        level: 'error',
        where,
        message: `No group tab runs on ${block.dayOfWeek} — block skipped (groups are created from group tabs)`,
      })
      continue
    }
    if (candidates.length > 1) {
      warnings.push({
        level: 'error',
        where,
        message: `${candidates.length} groups run on ${block.dayOfWeek} (${candidates.map((c) => c.name).join(', ')}) — block skipped, the weekday cannot tell them apart`,
      })
      continue
    }
    const group = candidates[0]

    // The block may name its own mentor; otherwise the tab's staff order
    // (mentor 1 → mentor 2 → asistent) decides who authored the cards.
    const blockAuthor = block.staffNames
      .map((n) => teachers.resolve(n, where))
      .find((k): k is string => k !== null)
    const authorKey = blockAuthor ?? group.teacherKeys[0]
    if (!authorKey) {
      warnings.push({
        level: 'error',
        where,
        message: 'No mentor on the block and none on the group tab — report cards skipped (an author is required)',
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
          message: `"${row.firstName} ${row.lastName}" is graded but missing from the group tab — enrolling without contact details or a date of birth`,
        })
        enrollments.push({ studentKey, groupKey: group.key })
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

  if (snapshot.seasonMonths.length === 0) {
    warnings.push({
      level: 'warn',
      where: 'season',
      message: `No CourseSeason dates for ${snapshot.schoolYear} / ${snapshot.city} — enrollments will be created with no payable months. Set the season on /admin/programi and re-run.`,
    })
  }

  return {
    schoolYear: snapshot.schoolYear,
    city: snapshot.city,
    locationId: snapshot.location.id,
    courseId: snapshot.competitionCourseId,
    seasonMonths: snapshot.seasonMonths,
    teachers: teachers.all(),
    groups,
    students: students.all(),
    enrollments,
    assessments,
    warnings,
  }
}
