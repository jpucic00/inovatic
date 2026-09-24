'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { archivedYearError } from '@/lib/school-year-guard'
import { fromDateKey } from '@/lib/session-dates'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import {
  computeSchoolYearPlan,
  MODULE_COUNT,
} from '@/lib/school-year-planner'
import { writeModuleWindows } from '@/lib/module-plan-sync'
import {
  completeSchoolYearPlanSchema,
  type CompleteSchoolYearPlanInput,
} from '@/lib/validators/admin/school-year-planner'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * Commits the school-year planner preview into ModuleSchedule rows for every
 * standard program (ProgramKind.STANDARD).

 * The competitive program is deliberately out of scope: it has five undated
 * natjecanja rather than four dated modules, so including it would trip the
 * MODULE_COUNT assertion below and abort the whole run. Its dates live on
 * CourseSeason and are set on `/admin/programi/[courseId]` instead. Identical (startDate, endDate)
 * pairs are written for every standard course's matching module-by-position —
 * SLR 1's Modul 1 and SLR 4's Modul 1 always get the same dates.
 *
 * The planner is intentionally independent of ScheduledGroups — admin plans
 * the year first, then creates groups (which only matter for attendance).
 *
 * Guards (each refuses with a Croatian message, no rows mutated):
 *   - non-ADMIN → throws via requireAdmin
 *   - archived school year → archivedYearError short-circuit
 *   - any standard module already has a date for the year → planner is
 *     one-shot; later changes come only through holidays
 *   - any standard course doesn't have exactly MODULE_COUNT modules → planner
 *     hardcodes 4 modules × 7 sessions = 28; refuse rather than silently skip
 *
 * All upserts ride a single $transaction so a partial failure can't leave
 * the year half-planned. From then on the windows are re-derived by
 * `rederiveModuleWindows` on every holiday change — nobody edits them by hand.
 */
export async function completeSchoolYearPlan(
  input: CompleteSchoolYearPlanInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = completeSchoolYearPlanSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { schoolYear, startDate } = parsed.data

  const archived = archivedYearError(schoolYear)
  if (archived) return archived

  // Re-derive holidays server-side. Never trust the client. Active weekdays
  // are NOT a planner input — the calendar always plans for all 6 weekdays
  // (Pon–Sub) regardless of which weekdays currently have ScheduledGroups.
  const holidayDates = await loadHolidayDateKeys(schoolYear, city)

  // Race-safe re-check: planner is only meant to seed an empty year — for the
  // caller's city. Each city plans the shared curriculum independently, so
  // Split having dates must not block Šibenik's first planner run.
  const existingDated = await db.moduleSchedule.count({
    where: {
      schoolYear,
      city,
      module: { course: { kind: 'STANDARD' } },
      OR: [{ startDate: { not: null } }, { endDate: { not: null } }],
    },
  })
  if (existingDated > 0) {
    return {
      success: false,
      error: 'Datumi modula već postoje — računaju se iz početka godine i praznika.',
    }
  }

  // Apply to every standard program — admin's intent is "all standard programs
  // share the same plan". ScheduledGroup existence is irrelevant: admin may
  // plan before any groups are created.
  const standardModules = await db.courseModule.findMany({
    where: { course: { kind: 'STANDARD' } },
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

  try {
    await db.$transaction(async (tx) => {
      for (const [, mods] of byCourse) {
        await writeModuleWindows(tx, {
          city,
          schoolYear,
          moduleIds: mods.map((m) => m.id),
          windows: plan.modules,
        })
      }
    })
  } catch (err) {
    console.error('completeSchoolYearPlan failed:', err)
    return { success: false, error: 'Greška pri spremanju plana školske godine.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/admin/programi')
  return { success: true }
}
