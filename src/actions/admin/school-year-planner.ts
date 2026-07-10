'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { archivedYearError } from '@/lib/school-year-guard'
import { fromDateKey } from '@/lib/session-dates'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import {
  computeSchoolYearPlan,
  MODULE_COUNT,
} from '@/lib/school-year-planner'
import {
  completeSchoolYearPlanSchema,
  type CompleteSchoolYearPlanInput,
} from '@/lib/validators/admin/school-year-planner'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * Commits the school-year planner preview into ModuleSchedule rows for every
 * standard program (Course.isCustom = false). Identical (startDate, endDate)
 * pairs are written for every standard course's matching module-by-position —
 * SLR 1's Modul 1 and SLR 4's Modul 1 always get the same dates.
 *
 * The planner is intentionally independent of ScheduledGroups — admin plans
 * the year first, then creates groups (which only matter for attendance).
 *
 * Guards (each refuses with a Croatian message, no rows mutated):
 *   - non-ADMIN → throws via requireAdmin
 *   - archived school year → archivedYearError short-circuit
 *   - any standard module already has a date for the year → admin should use
 *     /admin/programi instead; planner is one-shot
 *   - any standard course doesn't have exactly MODULE_COUNT modules → planner
 *     hardcodes 4 modules × 7 sessions = 28; refuse rather than silently skip
 *
 * All upserts ride a single $transaction so a partial failure can't leave
 * the year half-planned.
 */
export async function completeSchoolYearPlan(
  input: CompleteSchoolYearPlanInput,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = completeSchoolYearPlanSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { schoolYear, startDate } = parsed.data

  const archived = archivedYearError(schoolYear)
  if (archived) return archived

  // Re-derive holidays server-side. Never trust the client. Active weekdays
  // are NOT a planner input — the calendar always plans for all 6 weekdays
  // (Pon–Sub) regardless of which weekdays currently have ScheduledGroups.
  const holidayDates = await loadHolidayDateKeys(schoolYear)

  // Race-safe re-check: planner is only meant to seed an empty year.
  const existingDated = await db.moduleSchedule.count({
    where: {
      schoolYear,
      module: { course: { isCustom: false } },
      OR: [{ startDate: { not: null } }, { endDate: { not: null } }],
    },
  })
  if (existingDated > 0) {
    return {
      success: false,
      error: 'Datumi modula već postoje — uredite ih preko stranice programa.',
    }
  }

  // Apply to every standard program — admin's intent is "all standard programs
  // share the same plan". ScheduledGroup existence is irrelevant: admin may
  // plan before any groups are created.
  const standardModules = await db.courseModule.findMany({
    where: { course: { isCustom: false } },
    select: {
      id: true,
      sortOrder: true,
      courseId: true,
      course: { select: { title: true } },
    },
    orderBy: [{ courseId: 'asc' }, { sortOrder: 'asc' }],
  })

  // Sanity: every targeted standard course must have exactly MODULE_COUNT
  // modules.
  const byCourse = new Map<string, typeof standardModules>()
  for (const m of standardModules) {
    const arr = byCourse.get(m.courseId) ?? []
    arr.push(m)
    byCourse.set(m.courseId, arr)
  }
  for (const [, mods] of byCourse) {
    if (mods.length !== MODULE_COUNT) {
      return {
        success: false,
        error: `Standardni program "${mods[0]?.course.title ?? mods[0]?.courseId}" nema točno ${MODULE_COUNT} modula.`,
      }
    }
  }
  if (byCourse.size === 0) {
    return {
      success: false,
      error: 'Nema standardnih programa s grupama ove godine.',
    }
  }

  const plan = computeSchoolYearPlan({
    startDate: fromDateKey(startDate),
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates,
  })

  // Position in the per-course sorted module list — not the raw sortOrder
  // (seed convention is 1..4, but older / future data may be 0..3). Position
  // is the single source of truth for "Nth module of the year".
  const upserts: Array<ReturnType<typeof db.moduleSchedule.upsert>> = []
  for (const [, mods] of byCourse) {
    mods.forEach((m, position) => {
      const window = plan.modules[position]
      if (!window) return
      // TODO(city PR4): city from admin session instead of transitional SPLIT
      upserts.push(
        db.moduleSchedule.upsert({
          where: { moduleId_schoolYear_city: { moduleId: m.id, schoolYear, city: 'SPLIT' } },
          create: {
            moduleId: m.id,
            schoolYear,
            city: 'SPLIT',
            startDate: window.startDate,
            endDate: window.endDate,
          },
          update: {
            startDate: window.startDate,
            endDate: window.endDate,
          },
        }),
      )
    })
  }

  try {
    await db.$transaction(upserts)
  } catch (err) {
    console.error('completeSchoolYearPlan failed:', err)
    return { success: false, error: 'Greška pri spremanju plana školske godine.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/admin/programi')
  return { success: true }
}
