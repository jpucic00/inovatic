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
