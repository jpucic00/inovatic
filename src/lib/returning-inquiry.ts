import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import {
  candidateWheres,
  identityKey,
  legacyIdentityKey,
  studentMatchKey,
} from '@/lib/student-match'

type ReturningFlaggable = {
  // Nullable since PARTY inquiries carry no child. Such rows have no DOB either,
  // so identity matching below short-circuits to `isReturning: false`.
  childFirstName: string | null
  childLastName: string | null
  childDateOfBirth: string | null
  parentEmail: string
  studentId: string | null
  city: City
}

/**
 * Display-only "returning student" detection for a list of inquiries. Looks up
 * existing students matching each row's child identity in a single query, then
 * marks a row returning when a match exists that is NOT the student this very
 * inquiry created (so ACCOUNT_CREATED inquiries don't all read as returning).
 *
 * Two tiers, mirroring `findOrCreateStudent`: the strict rule (name + DOB) and
 * the legacy fallback (name + parent email against DOB-less imported accounts).
 * A student is keyed under exactly one tier — by its DOB when present, by its
 * parent email when not — so the tiers can never claim the same account. The
 * DB only narrows candidates; the name is decided by the shared key, which
 * folds whitespace, case and diacritics.
 *
 * Identity matching is deliberately GLOBAL across cities (owner decision), but
 * the result is split by tenant: a match in the inquiry's own city sets
 * `isReturning` (full behavior); a match that exists only in the other city
 * sets `isReturningOtherCity` instead — a neutral masked flag ("postojeći
 * polaznik (druga lokacija)") that leaks nothing beyond the inquiry itself.
 *
 * Shared by the admin inquiry list (`getInquiries`) and the dashboard's recent
 * inquiries so the "Ponovni upis" marker is consistent everywhere inquiries are
 * listed.
 */
export async function flagReturningInquiries<T extends ReturningFlaggable>(
  rows: T[],
): Promise<(T & { isReturning: boolean; isReturningOtherCity: boolean })[]> {
  const orClauses = rows.flatMap((r) =>
    candidateWheres({
      firstName: r.childFirstName ?? '',
      lastName: r.childLastName ?? '',
      dateOfBirth: r.childDateOfBirth,
      parentEmail: r.parentEmail,
    }),
  )

  const matchesByKey = new Map<string, { id: string; city: City }[]>()
  if (orClauses.length > 0) {
    const students = await db.user.findMany({
      where: { OR: orClauses },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        parentEmail: true,
        city: true,
      },
    })
    for (const s of students) {
      const key = studentMatchKey(s)
      if (!key) continue
      const list = matchesByKey.get(key) ?? []
      list.push({ id: s.id, city: s.city })
      matchesByKey.set(key, list)
    }
  }

  return rows.map((r) => {
    const strictKey = identityKey(
      r.childFirstName ?? '',
      r.childLastName ?? '',
      r.childDateOfBirth,
    )
    const legacyKey = legacyIdentityKey(
      r.childFirstName ?? '',
      r.childLastName ?? '',
      r.parentEmail,
    )
    const matches = [
      ...(strictKey ? (matchesByKey.get(strictKey) ?? []) : []),
      ...(legacyKey ? (matchesByKey.get(legacyKey) ?? []) : []),
    ].filter((m) => m.id !== r.studentId)
    const isReturning = matches.some((m) => m.city === r.city)
    return {
      ...r,
      isReturning,
      isReturningOtherCity: !isReturning && matches.length > 0,
    }
  })
}
