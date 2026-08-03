'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { adminAction } from '@/lib/admin-action'
import { archivedYearError } from '@/lib/school-year-guard'
import { isCompetition } from '@/lib/program-kind'
import { seasonMonths } from '@/lib/monthly-charges'
import {
  upsertCourseSeasonSchema,
  type UpsertCourseSeasonInput,
} from '@/lib/validators/admin/course-season'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * Set how long a COMPETITION program runs this school year, in this admin's
 * city. Mirrors `upsertModuleSchedule`: same archived-year guard, same
 * city-from-context rule, same "empty date clears it" semantics.
 *
 * Also re-syncs monthly charges for every enrollment on the program's groups in
 * this city and year — see {@link syncSeasonMonths}. Without that a season
 * extended in November would never bill December.
 */
export async function upsertCourseSeason(
  data: UpsertCourseSeasonInput,
): Promise<AdminActionResult> {
  return adminAction(upsertCourseSeasonSchema, data, async (input, { city }) => {
    const blocked = archivedYearError(input.schoolYear)
    if (blocked) return blocked

    const course = await db.course.findUnique({
      where: { id: input.courseId },
      select: { kind: true, city: true },
    })
    // Cross-city programs read as nonexistent — same message as a missing id.
    if (!course || (course.city !== null && course.city !== city)) {
      return { success: false, error: 'Program nije pronađen.' }
    }
    if (!isCompetition(course.kind)) {
      return {
        success: false,
        error: 'Trajanje se postavlja samo za natjecateljski program.',
      }
    }

    const startDate = input.startDate ? new Date(input.startDate) : null
    const endDate = input.endDate ? new Date(input.endDate) : null
    if (startDate && endDate && endDate < startDate) {
      return { success: false, error: 'Kraj programa ne može biti prije početka.' }
    }

    try {
      // One transaction: season dates and the monthly charges derived from them
      // commit together — a crash between the two would otherwise leave
      // children billed against the OLD season until someone re-edited it.
      await db.$transaction(async (tx) => {
        await tx.courseSeason.upsert({
          where: {
            courseId_schoolYear_city: {
              courseId: input.courseId,
              schoolYear: input.schoolYear,
              city,
            },
          },
          create: {
            courseId: input.courseId,
            schoolYear: input.schoolYear,
            city,
            startDate,
            endDate,
          },
          update: { startDate, endDate },
        })
        await syncSeasonMonths(tx, input.courseId, input.schoolYear, city, startDate, endDate)
      })
    } catch (err) {
      console.error('upsertCourseSeason failed:', err)
      return { success: false, error: 'Greška pri spremanju trajanja programa.' }
    }

    revalidatePath('/admin/programi', 'layout')
    revalidatePath('/admin/ucenici')
    return { success: true }
  })
}

/**
 * Bring every enrollment's monthly charges in line with the season dates.
 *
 * Adds months the season now covers (never before a student's own join month,
 * so extending the season backwards doesn't invent debt for classes they didn't
 * attend), and removes months that fell outside the new range — but only
 * **unpaid** ones. A month someone already paid for is never deleted by a date
 * edit; correcting that is a deliberate admin action on the student's card.
 */
async function syncSeasonMonths(
  tx: Prisma.TransactionClient,
  courseId: string,
  schoolYear: string,
  city: import('@prisma/client').City,
  startDate: Date | null,
  endDate: Date | null,
): Promise<void> {
  const enrollments = await tx.enrollment.findMany({
    where: {
      schoolYear,
      scheduledGroup: { courseId, city, schoolYear },
    },
    select: {
      id: true,
      createdAt: true,
      enrollmentMonths: { select: { id: true, periodStart: true, paidAt: true } },
    },
  })
  if (enrollments.length === 0) return

  const toCreate: { enrollmentId: string; periodStart: Date }[] = []
  const toDelete: string[] = []

  for (const e of enrollments) {
    const wanted = seasonMonths(startDate, endDate, e.createdAt)
    const wantedKeys = new Set(wanted.map((d) => d.getTime()))
    const existingKeys = new Set(e.enrollmentMonths.map((m) => m.periodStart.getTime()))

    for (const periodStart of wanted) {
      if (!existingKeys.has(periodStart.getTime())) {
        toCreate.push({ enrollmentId: e.id, periodStart })
      }
    }
    for (const m of e.enrollmentMonths) {
      if (m.paidAt === null && !wantedKeys.has(m.periodStart.getTime())) {
        toDelete.push(m.id)
      }
    }
  }

  if (toCreate.length > 0) {
    await tx.enrollmentMonth.createMany({ data: toCreate, skipDuplicates: true })
  }
  if (toDelete.length > 0) {
    await tx.enrollmentMonth.deleteMany({ where: { id: { in: toDelete } } })
  }
}
