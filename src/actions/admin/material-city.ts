'use server'

import { z } from 'zod'
import type { City, MaterialScope } from '@prisma/client'
import { db } from '@/lib/db'
import { adminAction } from '@/lib/admin-action'
import type { AdminActionResult } from '@/lib/action-types'
import { otherCityOnlyError } from '@/lib/material-city'
import { revalidateMaterialPaths } from '@/lib/material-revalidate'

const cityOnlySchema = z
  .object({
    materialId: z.string().min(1),
    reason: z
      .string()
      .trim()
      .min(5, 'Napišite zašto materijal ne vrijedi za drugi grad.')
      .max(500, 'Razlog može imati najviše 500 znakova.'),
  })
  .strict()

const makeSharedSchema = z.object({ materialId: z.string().min(1) }).strict()

type CurriculumRow = {
  scope: MaterialScope
  city: City | null
  /** The owning program's city; null = a shared program, undefined = a GROUP row. */
  courseCity: City | null | undefined
}

/** Loads a material together with the city of the program it belongs to. */
async function loadCurriculumRow(materialId: string) {
  const m = await db.material.findUnique({
    where: { id: materialId },
    select: {
      scope: true,
      city: true,
      course: { select: { city: true } },
      module: { select: { course: { select: { city: true } } } },
      lesson: { select: { course: { select: { city: true } } } },
    },
  })
  if (!m) return null
  // Picked by scope, never with `??`: a shared program's city IS null, and `??`
  // would read that null as "missing" and fall through to an absent relation.
  let courseCity: City | null | undefined
  if (m.scope === 'COURSE') courseCity = m.course?.city
  else if (m.scope === 'MODULE') courseCity = m.module?.course.city
  else if (m.scope === 'LESSON') courseCity = m.lesson?.course.city
  return { scope: m.scope, city: m.city, courseCity } satisfies CurriculumRow
}

/**
 * "Samo za moj grad": limits a shared curriculum material to the admin's own
 * city, with a required reason. Deliberately a separate step from adding a
 * material (owner decision 2026-10-10): the curriculum is the same in both
 * cities, and a city-only material must never happen by accident. The other
 * city still sees the row — greyed, with this reason — so the drift is visible.
 *
 * Only for curriculum of a SHARED program: a group's own material belongs to its
 * group already, and a radionica belongs to one city as a whole.
 */
export async function setMaterialCityOnly(data: unknown): Promise<AdminActionResult> {
  return adminAction(cityOnlySchema, data, async ({ materialId, reason }, { city }) => {
    const row = await loadCurriculumRow(materialId)
    // Another city's radionica reads as missing, as it does on every other page.
    if (!row || (row.courseCity && row.courseCity !== city)) {
      return { success: false, error: 'Materijal nije pronađen.' }
    }
    if (row.scope === 'GROUP') {
      return { success: false, error: 'Materijal grupe već vrijedi samo za tu grupu.' }
    }
    if (row.courseCity !== null) {
      return { success: false, error: 'Radionica već pripada jednom gradu.' }
    }
    const otherCity = otherCityOnlyError(row.city, city)
    if (otherCity) return otherCity

    await db.material.update({
      where: { id: materialId },
      data: { city, cityOnlyReason: reason },
    })
    revalidateMaterialPaths()
    return { success: true }
  })
}

/** "Vrati u oba grada": the owning city returns its city-only material to both. */
export async function makeMaterialShared(data: unknown): Promise<AdminActionResult> {
  return adminAction(makeSharedSchema, data, async ({ materialId }, { city }) => {
    const row = await loadCurriculumRow(materialId)
    if (!row) return { success: false, error: 'Materijal nije pronađen.' }
    if (row.city === null) return { success: true }
    const otherCity = otherCityOnlyError(row.city, city)
    if (otherCity) return otherCity

    await db.material.update({
      where: { id: materialId },
      data: { city: null, cityOnlyReason: null },
    })
    revalidateMaterialPaths()
    return { success: true }
  })
}
