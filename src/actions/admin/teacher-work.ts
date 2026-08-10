'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertUserInCity } from '@/lib/city-guard'
import { fromDateKey } from '@/lib/session-dates'
import type { AdminActionResult } from '@/lib/action-types'
import {
  updateTeacherHourlyRateSchema,
  type UpdateTeacherHourlyRateInput,
} from '@/lib/validators/admin/teacher'
import {
  buildTeacherWorkReport,
  recentMonthWindows,
  type TeacherWorkReport,
  type WorkReportGroup,
} from '@/lib/teacher-work-report'

/**
 * The last `REPORT_MONTH_COUNT` months of teaching hours for one staff member,
 * read straight from `TeacherAttendance` and priced at the teacher's current
 * hourly rate. Rows survive an unassignment, so the query is keyed on the
 * teacher — not on their current groups.
 */
export async function getTeacherWorkReport(
  userId: string,
): Promise<TeacherWorkReport> {
  const { city } = await requireAdminCtx()
  await assertUserInCity(userId, city)

  const windows = recentMonthWindows(new Date())
  // Newest first, so the oldest window is last.
  const oldest = windows[windows.length - 1]
  const newest = windows[0]

  const [rows, teacher] = await Promise.all([
    db.teacherAttendance.findMany({
      where: {
        userId,
        present: true,
        // The window bounds are date keys (nothing but serializable values crosses
        // this action's boundary); `sessionDate` is @db.Date at UTC midnight, so
        // the parsed keys compare exactly.
        sessionDate: {
          gte: fromDateKey(oldest.startKey),
          lte: fromDateKey(newest.endKey),
        },
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
    }),
    db.user.findUnique({ where: { id: userId }, select: { hourlyRateCents: true } }),
  ])

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
    rateCents: teacher?.hourlyRateCents ?? null,
  })
}

/**
 * Set (or clear, with a blank input) what this staff member is paid per hour.
 *
 * Scoped exactly like `getTeacher`: a teaching ADMIN is staff for this section
 * — Šibenik's only teacher is its admin — so the role filter admits both, and
 * the city guard keeps it inside the tenant.
 */
export async function updateTeacherHourlyRate(
  input: UpdateTeacherHourlyRateInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = updateTeacherHourlyRateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { id, hourlyRateCents } = parsed.data

  // Outside the try — the notFound() throw must not be swallowed by the catch.
  await assertUserInCity(id, city)

  try {
    const staff = await db.user.findUnique({
      where: { id, role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null, city },
      select: { id: true },
    })
    if (!staff) return { success: false, error: 'Nastavnik nije pronađen.' }

    await db.user.update({ where: { id }, data: { hourlyRateCents } })

    revalidatePath(`/admin/nastavnici/${id}`)
    return { success: true }
  } catch (err) {
    console.error('Failed to update teacher hourly rate:', err)
    return { success: false, error: 'Greška pri spremanju satnice.' }
  }
}
