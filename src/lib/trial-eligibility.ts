import { db } from '@/lib/db'
import { legacyIdentityWhere, studentIdentityWhere } from '@/lib/student-match'

/** The child identity a probni sat offer is decided on. */
type TrialChildIdentity = {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  parentEmail?: string | null
}

/**
 * Whether this child may be offered a probni sat — i.e. whether they are a
 * genuine first-timer.
 *
 * Built on the SAME two-tier matcher as returning-student detection
 * (`src/lib/student-match.ts`), so the trial offer and the "Ponovni upis" badge
 * can never disagree about whether a family has been here before:
 *   - strict: child name + date of birth
 *   - legacy: child name + parent e-mail, but ONLY against accounts whose
 *     `dateOfBirth` is still NULL
 *
 * The legacy tier is load-bearing here, not a fallback. Most previous-year
 * students came from the Excel workbooks with no date of birth, so the strict
 * rule alone would read nearly every returning child as new and hand out a free
 * lesson to families of ten years' standing.
 *
 * Matching is GLOBAL across cities, deliberately: a child who attended in
 * Šibenik is not a first-timer in Split. Unlike the admin's returning badge this
 * leaks nothing, because the outcome is an offer that simply is not made.
 *
 * A DOB-less, e-mail-less identity matches nobody and therefore reads as a
 * first-timer — the safe direction: the cost is one free lesson, whereas the
 * opposite error refuses a trial to someone genuinely entitled to it.
 */
export async function isFirstTimeChild(identity: TrialChildIdentity): Promise<boolean> {
  const strict = studentIdentityWhere(identity)
  const legacy = legacyIdentityWhere(identity)
  const clauses = [strict, legacy].filter((w): w is NonNullable<typeof w> => w !== null)
  if (clauses.length === 0) return true

  const existing = await db.user.findFirst({
    where: { OR: clauses, deletedAt: null },
    select: { id: true },
  })
  return existing === null
}
