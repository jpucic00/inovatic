'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'

export async function getAvailableSchoolYears(): Promise<string[]> {
  const result = await db.moduleSchedule.findMany({
    select: { schoolYear: true },
    distinct: ['schoolYear'],
    orderBy: { schoolYear: 'desc' },
  })
  return result.map((r) => r.schoolYear)
}

export async function createNewSchoolYear(
  targetYear: string,
): Promise<AdminActionResult> {
  await requireAdmin()

  if (!/^\d{4}\/\d{4}$/.test(targetYear)) {
    return { success: false, error: 'Format školske godine nije valjan (npr. 2026/2027).' }
  }

  const existing = await db.moduleSchedule.count({
    where: { schoolYear: targetYear },
  })
  if (existing > 0) {
    return { success: false, error: `Moduli za ${targetYear} već postoje.` }
  }

  // Get all standard course modules (templates)
  const modules = await db.courseModule.findMany({
    where: { course: { isCustom: false } },
    select: { id: true },
  })

  if (modules.length === 0) {
    return { success: false, error: 'Nema modula za kloniranje.' }
  }

  try {
    await db.moduleSchedule.createMany({
      data: modules.map((mod) => ({
        moduleId: mod.id,
        schoolYear: targetYear,
        startDate: null,
        endDate: null,
      })),
    })
  } catch (err) {
    console.error('createNewSchoolYear failed:', err)
    return { success: false, error: 'Greška pri kreiranju modula za novu godinu.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

export async function getCurrentSchoolYear(): Promise<string> {
  return computeSchoolYear()
}

/**
 * Ensures ModuleSchedule rows exist for the given school year.
 * Creates them for every standard-course module if missing, spreading
 * 4 modules evenly across the school year (Sep–Aug) so the public
 * inquiry form works out of the box on a fresh install.
 * Called from the admin programi page on first visit.
 */
export async function ensureSchedulesForYear(year: string): Promise<void> {
  const existing = await db.moduleSchedule.count({ where: { schoolYear: year } })
  if (existing > 0) return

  const modules = await db.courseModule.findMany({
    where: { course: { isCustom: false } },
    orderBy: [{ course: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, sortOrder: true },
  })
  if (modules.length === 0) return

  // Derive start year from "YYYY/YYYY" format (e.g. "2025/2026" → 2025)
  const startYear = parseInt(year.split('/')[0], 10)

  // Default date ranges for modules 1–4 within a school year
  const dateRanges = [
    { start: new Date(startYear, 8, 15), end: new Date(startYear, 11, 20) },      // Sep–Dec
    { start: new Date(startYear + 1, 0, 12), end: new Date(startYear + 1, 2, 28) }, // Jan–Mar
    { start: new Date(startYear + 1, 3, 7), end: new Date(startYear + 1, 5, 14) },  // Apr–Jun
    { start: new Date(startYear + 1, 5, 28), end: new Date(startYear + 1, 7, 30) }, // Jun–Aug
  ]

  await db.moduleSchedule.createMany({
    data: modules.map((mod) => {
      const range = dateRanges[(mod.sortOrder - 1) % 4]
      return {
        moduleId: mod.id,
        schoolYear: year,
        startDate: range?.start ?? null,
        endDate: range?.end ?? null,
      }
    }),
    skipDuplicates: true,
  })
}
