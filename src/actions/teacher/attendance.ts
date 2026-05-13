'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { computeExpectedSessions, fromDateKey, toDateKey } from '@/lib/session-dates'
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

type GroupAttendance = {
  groupId: string
  schoolYear: string
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  expectedSessions: string[] // YYYY-MM-DD, ascending
  extraSessions: string[] // sessionDates with records that fall outside expectedSessions
  roster: AttendanceRosterRow[]
  records: AttendanceRecord[]
}

/**
 * Returns everything the Dolazak tab needs to render: the roster for the
 * current school year, the expected weekly session dates implied by the
 * group's schedule + module windows, plus existing Attendance rows.
 * Dates on records that aren't in the expected list (e.g. makeup sessions
 * recorded manually) surface in `extraSessions` so the UI can still show them.
 */
export async function getGroupAttendance(groupId: string): Promise<GroupAttendance> {
  await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      id: true,
      schoolYear: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      courseId: true,
    },
  })

  const schoolYear = group.schoolYear

  const schedules = await db.moduleSchedule.findMany({
    where: { schoolYear, module: { courseId: group.courseId } },
    select: { startDate: true, endDate: true },
  })
  const moduleWindows = schedules.map((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
  }))

  const expectedDates = computeExpectedSessions({
    dayOfWeek: group.dayOfWeek,
    moduleWindows,
  })
  const expectedSessions = expectedDates.map(toDateKey)
  const expectedSet = new Set(expectedSessions)

  const enrollments = await db.enrollment.findMany({
    where: { scheduledGroupId: groupId, schoolYear },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true },
      },
      attendances: {
        orderBy: { sessionDate: 'asc' },
        include: {
          recordedBy: { select: { firstName: true, lastName: true, deletedAt: true } },
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
  const extraSet = new Set<string>()

  for (const e of enrollments) {
    for (const a of e.attendances) {
      const key = toDateKey(a.sessionDate)
      records.push({
        enrollmentId: e.id,
        sessionDate: key,
        present: a.present,
        note: a.note,
        recordedBy: a.recordedBy
          ? `${a.recordedBy.firstName} ${a.recordedBy.lastName}`
          : null,
        recordedByDeleted: a.recordedBy?.deletedAt != null,
      })
      if (!expectedSet.has(key)) extraSet.add(key)
    }
  }

  return {
    groupId: group.id,
    schoolYear,
    dayOfWeek: group.dayOfWeek,
    startTime: group.startTime,
    endTime: group.endTime,
    expectedSessions,
    extraSessions: Array.from(extraSet).sort((a, b) => a.localeCompare(b)),
    roster,
    records,
  }
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
