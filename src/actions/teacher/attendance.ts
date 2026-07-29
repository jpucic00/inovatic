'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import {
  computeRadionicaSessions,
  computeSeasonSessions,
  fromDateKey,
  todayUtc,
  toDateKey,
} from '@/lib/session-dates'
import { isCompetition, isRadionica } from '@/lib/program-kind'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
  type GroupModuleArcEntry,
} from '@/lib/group-module-arc'
import { assignAdhocDateToSection } from '@/lib/attendance-sections'
import {
  teacherMarkingError,
  teacherMarkingWindow,
  type MarkingWindow,
} from '@/lib/attendance-window'
import { loadHolidayDateKeys } from '@/lib/holidays'
import {
  bulkMarkSessionSchema,
  type BulkMarkSessionInput,
} from '@/lib/validators/attendance'
import type { AdminActionResult } from '@/lib/action-types'

export type AttendanceRosterRow = {
  enrollmentId: string
  studentId: string
  firstName: string
  lastName: string
}

export type AttendanceRecord = {
  enrollmentId: string
  sessionDate: string // YYYY-MM-DD
  present: boolean
  note: string | null
  recordedBy: string | null
  recordedByDeleted: boolean
}

export type AttendanceModuleSection = {
  /** FK target for `ModuleEnrollment.moduleScheduleId`. Null = placeholder safety-net for a module without a schedule row. */
  moduleScheduleId: string | null
  moduleId: string
  /** 1-based ordinal by sortOrder. */
  moduleIndex: number
  moduleTitle: string
  /** 7 race-ahead dates (0 for placeholder), YYYY-MM-DD ascending. */
  expectedSessions: string[]
  /** Record-only dates that land inside this module's [firstSession, lastSession] window. */
  adhocSessions: string[]
  /** Enrollment IDs of students in this module's ModuleEnrollment. */
  enrolledEnrollmentIds: string[]
  firstSession: string | null
  lastSession: string | null
}

export type TeacherAttendanceRow = {
  userId: string
  name: string
  /** False for a teacher who worked here in the past but is no longer assigned. */
  assigned: boolean
}

export type TeacherAttendanceRecord = {
  userId: string
  sessionDate: string // YYYY-MM-DD
  present: boolean
}

type GroupAttendanceBase = {
  groupId: string
  schoolYear: string
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  roster: AttendanceRosterRow[]
  records: AttendanceRecord[]
  /** Assigned teachers first, then anyone with historic hours on this group. */
  teachers: TeacherAttendanceRow[]
  teacherRecords: TeacherAttendanceRecord[]
  /** The dates this viewer may still write. Null for an admin — no limit. */
  markingWindow: MarkingWindow | null
}

export type GroupAttendance =
  | (GroupAttendanceBase & {
      /** 'custom' = radionica (daily over a range); 'season' = competition
       *  (one session a week across the program's season). Same flat shape. */
      kind: 'custom' | 'season'
      expectedSessions: string[]
      extraSessions: string[]
    })
  | (GroupAttendanceBase & {
      kind: 'standard'
      sections: AttendanceModuleSection[]
      /** Record-only dates that don't land inside any module window. */
      otherDates: string[]
      /** Pre-computed initial selection so the component stays dumb. */
      defaultSelectedDate: string
    })

function loadAttendanceGroup(groupId: string) {
  return db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      id: true,
      schoolYear: true,
      city: true,
      dayOfWeek: true,
      dateStart: true,
      dateEnd: true,
      startTime: true,
      endTime: true,
      courseId: true,
      course: {
        select: {
          kind: true,
          // Seasons for the competitive program. Narrowed to this group's
          // (schoolYear, city) at the call site — Prisma sub-selects cannot
          // correlate against the parent row's own columns.
          seasons: {
            select: { schoolYear: true, city: true, startDate: true, endDate: true },
          },
          modules: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                select: {
                  id: true,
                  schoolYear: true,
                  city: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })
}
type AttendanceGroup = Awaited<ReturnType<typeof loadAttendanceGroup>>

function loadAttendanceEnrollments(groupId: string, schoolYear: string) {
  return db.enrollment.findMany({
    where: { scheduledGroupId: groupId, schoolYear },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true },
      },
      moduleEnrollments: {
        select: { moduleScheduleId: true },
      },
      attendances: {
        orderBy: { sessionDate: 'asc' },
        include: {
          recordedBy: {
            select: { firstName: true, lastName: true, deletedAt: true },
          },
        },
      },
    },
  })
}
type AttendanceEnrollment = Awaited<
  ReturnType<typeof loadAttendanceEnrollments>
>[number]

type HolidayDateKeys = Awaited<ReturnType<typeof loadHolidayDateKeys>>

/**
 * Teaching-hours roster for the marker: everyone currently assigned, plus any
 * teacher who already has hours here (kept visible read-only, because those
 * rows survive an unassignment).
 */
async function loadTeacherAttendance(groupId: string): Promise<{
  teachers: TeacherAttendanceRow[]
  teacherRecords: TeacherAttendanceRecord[]
}> {
  const [assignments, rows] = await Promise.all([
    db.teacherAssignment.findMany({
      where: { scheduledGroupId: groupId },
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.teacherAttendance.findMany({
      where: { scheduledGroupId: groupId },
      select: {
        userId: true,
        sessionDate: true,
        present: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  const teachers = new Map<string, TeacherAttendanceRow>()
  for (const a of assignments) {
    teachers.set(a.user.id, {
      userId: a.user.id,
      name: `${a.user.firstName} ${a.user.lastName}`,
      assigned: true,
    })
  }
  for (const r of rows) {
    if (teachers.has(r.userId)) continue
    teachers.set(r.userId, {
      userId: r.userId,
      name: `${r.user.firstName} ${r.user.lastName}`,
      assigned: false,
    })
  }

  return {
    teachers: Array.from(teachers.values()).sort(
      (a, b) => Number(b.assigned) - Number(a.assigned) || a.name.localeCompare(b.name, 'hr'),
    ),
    teacherRecords: rows.map((r) => ({
      userId: r.userId,
      sessionDate: toDateKey(r.sessionDate),
      present: r.present,
    })),
  }
}

/** Flatten each enrollment's Attendance rows into the flat record list the UI consumes. */
function flattenAttendanceRecords(
  enrollments: AttendanceEnrollment[],
): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  for (const e of enrollments) {
    for (const a of e.attendances) {
      records.push({
        enrollmentId: e.id,
        sessionDate: toDateKey(a.sessionDate),
        present: a.present,
        note: a.note,
        recordedBy: a.recordedBy
          ? `${a.recordedBy.firstName} ${a.recordedBy.lastName}`
          : null,
        recordedByDeleted: a.recordedBy?.deletedAt != null,
      })
    }
  }
  return records
}

/**
 * Flat branch: a precomputed expected-session list plus any extra recorded
 * dates. Shared by the two kinds that aren't paced by modules — a radionica
 * (every day of its range) and a competition group (one session a week across
 * the season) — since the UI shape is identical either way.
 */
function buildFlatAttendance(
  base: GroupAttendanceBase,
  kind: 'custom' | 'season',
  expectedDates: Date[],
  records: AttendanceRecord[],
): GroupAttendance {
  const expectedSessions = expectedDates.map(toDateKey)
  const expectedSet = new Set(expectedSessions)
  const extraSet = new Set<string>()
  for (const r of records) {
    if (!expectedSet.has(r.sessionDate)) extraSet.add(r.sessionDate)
  }
  return {
    ...base,
    kind,
    expectedSessions,
    extraSessions: Array.from(extraSet).sort((a, b) => a.localeCompare(b)),
  }
}

/**
 * Distribute record-only dates (Attendance rows whose date isn't in any
 * module's expected list) into the matching section's `adhocSessions` (mutated
 * in place); return the leftovers for the "Ostali termini" bucket.
 */
function bucketAdhocDates(
  sections: AttendanceModuleSection[],
  records: AttendanceRecord[],
): string[] {
  const expectedSet = new Set<string>()
  for (const s of sections) for (const d of s.expectedSessions) expectedSet.add(d)
  const otherSet = new Set<string>()
  for (const r of records) {
    if (expectedSet.has(r.sessionDate)) continue
    const idx = assignAdhocDateToSection(r.sessionDate, sections)
    if (idx === null) otherSet.add(r.sessionDate)
    else if (!sections[idx].adhocSessions.includes(r.sessionDate)) {
      sections[idx].adhocSessions.push(r.sessionDate)
    }
  }
  for (const s of sections) s.adhocSessions.sort((a, b) => a.localeCompare(b))
  return Array.from(otherSet).sort((a, b) => a.localeCompare(b))
}

/** Standard branch: build the race-ahead arc, slice it into module sections, bucket ad-hoc dates. */
function buildStandardAttendance(
  base: GroupAttendanceBase,
  group: AttendanceGroup,
  schoolYear: string,
  holidayDates: HolidayDateKeys,
  enrollments: AttendanceEnrollment[],
  records: AttendanceRecord[],
): GroupAttendance {
  const modulesForArc = group.course.modules.map((m) => {
    const schedule = m.schedules.find(
      (s) => s.schoolYear === schoolYear && s.city === group.city,
    )
    return {
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      schedule: schedule
        ? { id: schedule.id, startDate: schedule.startDate, endDate: schedule.endDate }
        : null,
    }
  })
  const arc = getGroupModuleArc({
    dayOfWeek: group.dayOfWeek,
    modules: modulesForArc,
    holidayDates,
  })
  const arcByModuleId = new Map(arc.map((e) => [e.moduleId, e]))

  const sections: AttendanceModuleSection[] = group.course.modules.map((m, idx) => {
    const arcEntry = arcByModuleId.get(m.id) ?? null
    const enrolledEnrollmentIds = arcEntry
      ? enrollments
          .filter((e) =>
            e.moduleEnrollments.some(
              (me) => me.moduleScheduleId === arcEntry.moduleScheduleId,
            ),
          )
          .map((e) => e.id)
      : []
    return {
      moduleScheduleId: arcEntry?.moduleScheduleId ?? null,
      moduleId: m.id,
      moduleIndex: idx + 1,
      moduleTitle: m.title,
      expectedSessions: arcEntry ? arcEntry.sessionDates.map(toDateKey) : [],
      adhocSessions: [],
      enrolledEnrollmentIds,
      firstSession: arcEntry ? toDateKey(arcEntry.firstSession) : null,
      lastSession: arcEntry ? toDateKey(arcEntry.lastSession) : null,
    }
  })

  const otherDates = bucketAdhocDates(sections, records)

  return {
    ...base,
    kind: 'standard',
    sections,
    otherDates,
    defaultSelectedDate: pickDefaultSelectedDate(arc, sections),
  }
}

/**
 * Returns everything the Dolazak tab needs.
 *   STANDARD    dates sliced into 4 race-ahead module sections (per-group,
 *               holiday-aware via `loadHolidayDateKeys`).
 *   RADIONICA   flat list: every day of the group's [dateStart, dateEnd].
 *   COMPETITION flat list: one session a week on the group's weekday across the
 *               program's season, with holiday weeks dropped entirely.
 */
export async function getGroupAttendance(
  groupId: string,
): Promise<GroupAttendance> {
  const { session } = await assertTeacherOwnsGroup(groupId)

  const group = await loadAttendanceGroup(groupId)
  const schoolYear = group.schoolYear
  const holidayDates = await loadHolidayDateKeys(schoolYear, group.city)

  const [enrollments, teacherData] = await Promise.all([
    loadAttendanceEnrollments(groupId, schoolYear),
    loadTeacherAttendance(groupId),
  ])

  const roster: AttendanceRosterRow[] = enrollments.map((e) => ({
    enrollmentId: e.id,
    studentId: e.user.id,
    firstName: e.user.firstName,
    lastName: e.user.lastName,
  }))

  const records = flattenAttendanceRecords(enrollments)

  const base: GroupAttendanceBase = {
    groupId: group.id,
    schoolYear,
    dayOfWeek: group.dayOfWeek,
    dateStart: group.dateStart,
    dateEnd: group.dateEnd,
    startTime: group.startTime,
    endTime: group.endTime,
    roster,
    records,
    teachers: teacherData.teachers,
    teacherRecords: teacherData.teacherRecords,
    // Admins keep the unrestricted correction path; teachers see past sessions
    // read-only so the arc stays visible without offering a dead Save button.
    markingWindow: session.user.role === 'TEACHER' ? teacherMarkingWindow(new Date()) : null,
  }

  if (isRadionica(group.course.kind)) {
    return buildFlatAttendance(
      base,
      'custom',
      computeRadionicaSessions({
        dateStart: group.dateStart,
        dateEnd: group.dateEnd,
        holidayDates,
      }),
      records,
    )
  }

  if (isCompetition(group.course.kind)) {
    const season =
      group.course.seasons.find(
        (x) => x.schoolYear === schoolYear && x.city === group.city,
      ) ?? null
    return buildFlatAttendance(
      base,
      'season',
      computeSeasonSessions({
        dayOfWeek: group.dayOfWeek,
        startDate: season?.startDate ?? null,
        endDate: season?.endDate ?? null,
        holidayDates,
      }),
      records,
    )
  }

  return buildStandardAttendance(base, group, schoolYear, holidayDates, enrollments, records)
}

/**
 * Resolve the default date from the arc's active-module state, or null when the
 * arc is empty / no module phase applies (caller then falls back to sections).
 */
function pickDateFromArcState(
  arc: GroupModuleArcEntry[],
  today: string,
): string | null {
  if (arc.length === 0) return null
  const state = getActiveModuleForGroup(arc, todayUtc())
  const inProgress = state.inProgressModule
  if (inProgress) {
    const dates = inProgress.sessionDates.map(toDateKey)
    if (dates.includes(today)) return today
    const past = dates.filter((d) => d <= today)
    if (past.length > 0) return past.at(-1)!
    return dates[0]
  }
  if (state.lastCompletedModule) {
    const dates = state.lastCompletedModule.sessionDates.map(toDateKey)
    const past = dates.filter((d) => d <= today)
    return past.at(-1) ?? dates.at(-1) ?? today
  }
  if (state.nextEnrollingModule) {
    return toDateKey(state.nextEnrollingModule.firstSession)
  }
  return null
}

function pickDefaultSelectedDate(
  arc: GroupModuleArcEntry[],
  sections: AttendanceModuleSection[],
): string {
  const today = toDateKey(todayUtc())
  const fromArc = pickDateFromArcState(arc, today)
  if (fromArc !== null) return fromArc
  for (const s of sections) {
    if (s.expectedSessions.length > 0) return s.expectedSessions[0]
  }
  return today
}

/**
 * Resolve the teaching hours to write for this session.
 *
 * Explicit entries win (the marker sends one per assigned teacher whenever the
 * group has more than one). A group with a single teacher needs no interaction:
 * marking the students books that teacher's hour. Nothing is ever booked for
 * someone who isn't assigned to the group — a stand-in must be assigned first.
 */
function resolveTeacherEntries(
  provided: { userId: string; present: boolean }[] | undefined,
  assignedUserIds: string[],
): { userId: string; present: boolean }[] {
  const assigned = new Set(assignedUserIds)
  const entries = (provided ?? []).filter((e) => assigned.has(e.userId))
  const covered = new Set(entries.map((e) => e.userId))

  if (assignedUserIds.length === 1 && !covered.has(assignedUserIds[0])) {
    entries.push({ userId: assignedUserIds[0], present: true })
  }
  return entries
}

/**
 * Mark a whole class session in one round-trip: validates that every
 * supplied enrollment belongs to this group + school year, then upserts each
 * row with the caller's id in `recordedById`. Teaching hours are written in the
 * same transaction — see `resolveTeacherEntries`.
 */
export async function bulkMarkSession(
  input: BulkMarkSessionInput,
): Promise<AdminActionResult> {
  const parsed = bulkMarkSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevažeći podaci.' }
  }
  const data = parsed.data

  const { session } = await assertTeacherOwnsGroup(data.groupId)

  // Teaching hours are payout basis, so a TEACHER may only record the current
  // month up to today. Admins keep the unrestricted path in
  // `src/actions/admin/attendance.ts` for genuinely missed sessions.
  if (session.user.role === 'TEACHER') {
    const windowError = teacherMarkingError(data.sessionDate, new Date())
    if (windowError) return { success: false, error: windowError }
  }

  const enrollmentIds = data.entries.map((e) => e.enrollmentId)
  const sessionDate = fromDateKey(data.sessionDate)
  const recorderId = session.user.id

  const ENROLLMENT_MISMATCH = 'ENROLLMENT_MISMATCH'
  let enrolledUserIds: string[] = []

  try {
    await db.$transaction(
      async (tx) => {
        const group = await tx.scheduledGroup.findUniqueOrThrow({
          where: { id: data.groupId },
          select: { schoolYear: true },
        })

        const enrollments = await tx.enrollment.findMany({
          where: {
            id: { in: enrollmentIds },
            scheduledGroupId: data.groupId,
            schoolYear: group.schoolYear,
          },
          select: { id: true, userId: true },
        })
        if (enrollments.length !== enrollmentIds.length) {
          throw new Error(ENROLLMENT_MISMATCH)
        }

        enrolledUserIds = enrollments.map((e) => e.userId)

        for (const e of data.entries) {
          await tx.attendance.upsert({
            where: {
              enrollmentId_sessionDate: {
                enrollmentId: e.enrollmentId,
                sessionDate,
              },
            },
            create: {
              enrollmentId: e.enrollmentId,
              sessionDate,
              present: e.present,
              note: e.note || null,
              recordedById: recorderId,
            },
            update: {
              present: e.present,
              note: e.note || null,
              recordedById: recorderId,
            },
          })
        }

        const assignments = await tx.teacherAssignment.findMany({
          where: { scheduledGroupId: data.groupId },
          select: { userId: true },
        })
        const teacherEntries = resolveTeacherEntries(
          data.teacherEntries,
          assignments.map((a) => a.userId),
        )
        for (const t of teacherEntries) {
          await tx.teacherAttendance.upsert({
            where: {
              userId_scheduledGroupId_sessionDate: {
                userId: t.userId,
                scheduledGroupId: data.groupId,
                sessionDate,
              },
            },
            create: {
              userId: t.userId,
              scheduledGroupId: data.groupId,
              sessionDate,
              present: t.present,
              recordedById: recorderId,
            },
            update: { present: t.present, recordedById: recorderId },
          })
        }
      },
      { isolationLevel: 'Serializable' },
    )
    revalidateAttendancePaths(data.groupId, enrolledUserIds)
    return { success: true }
  } catch (err) {
    if (err instanceof Error && err.message === ENROLLMENT_MISMATCH) {
      return { success: false, error: 'Neki upisi ne pripadaju ovoj grupi ili školskoj godini.' }
    }
    console.error('bulkMarkSession failed:', err)
    return { success: false, error: 'Greška pri spremanju evidencije.' }
  }
}

function revalidateAttendancePaths(groupId: string, userIds: string | string[]) {
  revalidatePath(`/nastavnik/grupa/${groupId}/dolazak`)
  const ids = Array.isArray(userIds) ? userIds : [userIds]
  for (const id of ids) {
    revalidatePath(`/admin/ucenici/${id}`)
    revalidatePath(`/nastavnik/ucenik/${id}`)
  }
}
