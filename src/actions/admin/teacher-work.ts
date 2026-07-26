'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertUserInCity } from '@/lib/city-guard'
import {
  buildTeacherWorkReport,
  monthWindows,
  type TeacherWorkReport,
  type WorkReportGroup,
} from '@/lib/teacher-work-report'

/**
 * Current + previous month of teaching hours for one staff member, read
 * straight from `TeacherAttendance`. Rows survive an unassignment, so the query
 * is keyed on the teacher — not on their current groups.
 */
export async function getTeacherWorkReport(
  userId: string,
): Promise<TeacherWorkReport> {
  const { city } = await requireAdminCtx()
  await assertUserInCity(userId, city)

  const windows = monthWindows(new Date())

  const rows = await db.teacherAttendance.findMany({
    where: {
      userId,
      present: true,
      sessionDate: { gte: windows.previous.start, lte: windows.current.end },
      scheduledGroup: { city },
    },
    select: {
      sessionDate: true,
      scheduledGroup: {
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          course: { select: { title: true } },
        },
      },
    },
  })

  const groups = new Map<string, WorkReportGroup>()
  for (const row of rows) {
    const g = row.scheduledGroup
    if (!groups.has(g.id)) {
      groups.set(g.id, {
        id: g.id,
        label: g.name ?? g.course.title,
        startTime: g.startTime,
        endTime: g.endTime,
      })
    }
  }

  return buildTeacherWorkReport({
    groups: Array.from(groups.values()),
    rows: rows.map((r) => ({
      scheduledGroupId: r.scheduledGroup.id,
      sessionDate: r.sessionDate,
    })),
    windows,
  })
}
