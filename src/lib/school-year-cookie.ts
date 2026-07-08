import { cookies } from 'next/headers'
import { computeSchoolYear } from '@/lib/school-year'
import { db } from '@/lib/db'

const SCHOOL_YEAR_COOKIE = 'inovatic_school_year'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/

// Session cookie (no maxAge/expires) scoped to the admin panel only —
// teacher/student/public routes never receive it.
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/admin',
  secure: process.env.NODE_ENV === 'production',
} as const

/**
 * The school year the admin is currently viewing. Read-only — safe to call
 * from a Server Component render. Falls back to the date-computed current
 * year when the cookie is missing or malformed.
 */
export async function getSelectedSchoolYear(): Promise<string> {
  const raw = (await cookies()).get(SCHOOL_YEAR_COOKIE)?.value
  if (!raw || !SCHOOL_YEAR_RE.test(raw)) return computeSchoolYear()
  const exists = await db.schoolYear.findUnique({ where: { label: raw }, select: { label: true } })
  return exists ? raw : computeSchoolYear()
}

/** Persists the selection. Only legal inside a Server Action / Route Handler. */
export async function setSchoolYearCookie(year: string): Promise<void> {
  ;(await cookies()).set(SCHOOL_YEAR_COOKIE, year, cookieOptions)
}

/** Clears the selection so the next session starts on the current year. */
export async function clearSchoolYearCookie(): Promise<void> {
  ;(await cookies()).delete({ name: SCHOOL_YEAR_COOKIE, path: '/admin' })
}
