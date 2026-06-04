'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import {
  computeRadionicaSessions,
  fromDateKey,
  todayUtc,
  toDateKey,
} from '@/lib/session-dates'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
  type GroupModuleArcEntry,
} from '@/lib/group-module-arc'
import { assignAdhocDateToSection } from '@/lib/attendance-sections'
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
}

export type GroupAttendance =
  | (GroupAttendanceBase & {
      kind: 'custom'
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

/**
 * Returns everything the Dolazak tab needs. For standard programs the dates
 * are sliced into 4 race-ahead module sections (per-group, holiday-aware via
 * `loadHolidayDateKeys`); for radionice the flat list is preserved.
 */
export async function getGroupAttendance(
  groupId: string,
): Promise<GroupAttendance> {
  await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      id: true,
      schoolYear: true,
      dayOfWeek: true,
      dateStart: true,
      dateEnd: true,
      startTime: true,
      endTime: true,
      courseId: true,
      course: {
        select: {
          isCustom: true,
          modules: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                select: {
                  id: true,
                  schoolYear: true,
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

  const schoolYear = group.schoolYear
  const isCustom = group.course.isCustom
  const holidayDates = await loadHolidayDateKeys(schoolYear)

  const enrollments = await db.enrollment.findMany({
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

  const roster: AttendanceRosterRow[] = enrollments.map((e) => ({
    enrollmentId: e.id,
    studentId: e.user.id,
    firstName: e.user.firstName,
    lastName: e.user.lastName,
  }))

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
  }

  if (isCustom) {
    const expectedDates = computeRadionicaSessions({
      dateStart: group.dateStart,
      dateEnd: group.dateEnd,
      holidayDates,
    })
    const expectedSessions = expectedDates.map(toDateKey)
    const expectedSet = new Set(expectedSessions)
    const extraSet = new Set<string>()
    for (const r of records) {
      if (!expectedSet.has(r.sessionDate)) extraSet.add(r.sessionDate)
    }
    return {
      ...base,
      kind: 'custom',
      expectedSessions,
      extraSessions: Array.from(extraSet).sort((a, b) => a.localeCompare(b)),
    }
  }

  // Standard branch: build race-ahead arc, then map to sections.
  const modulesForArc = group.course.modules.map((m) => {
    const schedule = m.schedules.find((s) => s.schoolYear === schoolYear)
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

  // Bucket record-only dates (Attendance rows whose date isn't in any module's
  // expected list) into the matching section, or surface as "Ostali termini".
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

  return {
    ...base,
    kind: 'standard',
    sections,
    otherDates: Array.from(otherSet).sort((a, b) => a.localeCompare(b)),
    defaultSelectedDate: pickDefaultSelectedDate(arc, sections),
  }
}

function pickDefaultSelectedDate(
  arc: GroupModuleArcEntry[],
  sections: AttendanceModuleSection[],
): string {
  const today = toDateKey(todayUtc())
  if (arc.length > 0) {
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
  }
  for (const s of sections) {
    if (s.expectedSessions.length > 0) return s.expectedSessions[0]
  }
  return today
}

/**
 * Mark a whole class session in one round-trip: validates that every
 * supplied enrollment belongs to this group + school year, then upserts each
 * row with the caller's id in `recordedById`.
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
