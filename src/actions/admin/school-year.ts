'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import { setSchoolYearCookie } from '@/lib/school-year-cookie'
import type { AdminActionResult } from '@/lib/action-types'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/

/**
 * Every registered school year, newest first. Lazily registers the
 * date-computed current year so it always appears, even on a fresh DB or
 * after the calendar rolls into a new school year.
 */
export async function getAllSchoolYears(): Promise<string[]> {
  await requireAdmin()

  const current = computeSchoolYear()
  await db.schoolYear.upsert({
    where: { label: current },
    create: { label: current },
    update: {},
  })

  const rows = await db.schoolYear.findMany({ orderBy: { label: 'desc' } })
  return rows.map((r) => r.label)
}

/** Switches the admin panel to the given (already-registered) school year. */
export async function setSelectedSchoolYear(year: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!SCHOOL_YEAR_RE.test(year)) {
    return { success: false, error: 'Format školske godine nije valjan.' }
  }

  const exists = await db.schoolYear.findUnique({ where: { label: year } })
  if (!exists) {
    return { success: false, error: 'Školska godina ne postoji.' }
  }

  await setSchoolYearCookie(year)
  revalidatePath('/admin', 'layout')
  return { success: true }
}

/**
 * Creates the next school year as a genuine blank slate — no groups, no
 * module schedules are carried over — and switches the admin panel to it.
 */
export async function createSchoolYear(): Promise<AdminActionResult> {
  await requireAdmin()

  const latest = await db.schoolYear.findFirst({ orderBy: { label: 'desc' } })
  const next = getNextSchoolYear(latest?.label ?? computeSchoolYear())

  const already = await db.schoolYear.findUnique({ where: { label: next } })
  if (already) {
    return { success: false, error: `Školska godina ${next} već postoji.` }
  }

  try {
    await db.schoolYear.create({ data: { label: next } })
  } catch (err) {
    console.error('createSchoolYear failed:', err)
    return { success: false, error: 'Greška pri kreiranju školske godine.' }
  }

  await setSchoolYearCookie(next)
  revalidatePath('/admin', 'layout')
  return { success: true }
}
