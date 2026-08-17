'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { adminAction } from '@/lib/admin-action'
import { requireAdminCtx } from '@/lib/auth-guard'
import { archivedYearError } from '@/lib/school-year-guard'
import { fromDateKey } from '@/lib/session-dates'
import {
  clearTrialWeekSchema,
  upsertTrialWeekSchema,
  type ClearTrialWeekInput,
  type UpsertTrialWeekInput,
} from '@/lib/validators/admin/trial-week'
import type { AdminActionResult } from '@/lib/action-types'

/** This city's probni sat week for the given year, or null. */
export async function getTrialWeek(schoolYear: string) {
  const { city } = await requireAdminCtx()
  const row = await db.trialWeek.findUnique({
    where: { schoolYear_city: { schoolYear, city } },
    select: { startDate: true, endDate: true },
  })
  return row
}

/**
 * Set the week of free trial lessons for this city and year.
 *
 * The range must span at most one calendar week: every standard group runs its
 * trial on its own weekday inside it, and a longer range would silently give the
 * first matching weekday rather than an obvious error.
 *
 * City comes from the admin's own context, like every other tenant-owned write.
 */
export async function upsertTrialWeek(
  data: UpsertTrialWeekInput,
): Promise<AdminActionResult> {
  return adminAction(upsertTrialWeekSchema, data, async (input, { city }) => {
    const blocked = archivedYearError(input.schoolYear)
    if (blocked) return blocked

    const start = fromDateKey(input.startDate)
    const end = fromDateKey(input.endDate)
    if (end.getTime() < start.getTime()) {
      return { success: false, error: 'Kraj tjedna ne može biti prije početka.' }
    }
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000
    if (spanDays > 6) {
      return {
        success: false,
        error: 'Probni tjedan može trajati najviše 7 dana — svaka grupa ima svoj dan u tjednu.',
      }
    }

    try {
      await db.trialWeek.upsert({
        where: { schoolYear_city: { schoolYear: input.schoolYear, city } },
        create: { schoolYear: input.schoolYear, city, startDate: start, endDate: end },
        update: { startDate: start, endDate: end },
      })
    } catch (err) {
      console.error('upsertTrialWeek failed:', err)
      return { success: false, error: 'Greška pri spremanju probnog tjedna.' }
    }

    revalidateTrialSurfaces()
    return { success: true }
  })
}

/**
 * Remove the probni sat week entirely. The row's ABSENCE is the "no trial this
 * year" state — which is also why this is a delete rather than blanking the
 * dates, and why the public form stops offering a trial the moment it runs.
 */
export async function clearTrialWeek(
  data: ClearTrialWeekInput,
): Promise<AdminActionResult> {
  return adminAction(clearTrialWeekSchema, data, async (input, { city }) => {
    const blocked = archivedYearError(input.schoolYear)
    if (blocked) return blocked

    try {
      await db.trialWeek.deleteMany({
        where: { schoolYear: input.schoolYear, city },
      })
    } catch (err) {
      console.error('clearTrialWeek failed:', err)
      return { success: false, error: 'Greška pri brisanju probnog tjedna.' }
    }

    revalidateTrialSurfaces()
    return { success: true }
  })
}

/**
 * Everything whose output depends on the trial week: the planner page that edits
 * it, the public signup form that offers it, and the teacher Dolazak tab where
 * the session appears.
 */
function revalidateTrialSurfaces(): void {
  revalidatePath('/admin/skolska-godina')
  revalidatePath('/prijava')
  revalidatePath('/nastavnik/grupa/[id]', 'page')
}
