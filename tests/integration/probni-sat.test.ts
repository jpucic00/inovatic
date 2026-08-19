/**
 * Probni tjedan — the week itself.
 *
 * The parent-facing half of this feature is gone (Flux `rgyemhz`): there is no
 * checkbox on the prijavnica, no public eligibility endpoint, and `Inquiry` no
 * longer records a requested trial. Staff decide who is new and mail the termin
 * when they schedule it. What remains — and what this file covers — is the week
 * an admin plans, and the date each group derives from it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createLocation } from './helpers/factory'
import { computeSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'
import { fromDateKey, toDateKey } from '@/lib/session-dates'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))

const YEAR = computeSchoolYear()

/**
 * Dates are DERIVED FROM TODAY, never pinned. A hardcoded week silently rots
 * past its own date and the failure then reads as a trial-week bug; the first
 * version of this file pinned a window whose start was a Tuesday — the fixture
 * group's own weekday — and would have gone red four weeks after it was written.
 */
const dayMs = 86_400_000
const dateKey = (d: Date) => d.toISOString().slice(0, 10)

/** The Monday of the week `weeks` ahead of the current one. */
function mondayIn(weeks: number): Date {
  const now = new Date()
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dow = new Date(utc).getUTCDay() // 0 = Sunday
  const toMonday = dow === 0 ? 1 : 1 - dow
  return new Date(utc + (toMonday + weeks * 7) * dayMs)
}

// A whole Mon–Sat week three weeks out: always ahead, and it contains exactly
// one Tuesday, which is the fixture group's day.
const TRIAL_MONDAY = mondayIn(3)
const WEEK_START = dateKey(TRIAL_MONDAY)
const WEEK_END = dateKey(new Date(TRIAL_MONDAY.getTime() + 5 * dayMs))
const TUESDAY = dateKey(new Date(TRIAL_MONDAY.getTime() + dayMs))

const { resolveTrialDateForGroup } = await import('@/lib/trial-week')
const { upsertTrialWeek, clearTrialWeek, getTrialWeek } = await import(
  '@/actions/admin/trial-week'
)

beforeEach(async () => {
  await db.trialWeek.deleteMany({ where: { schoolYear: { in: [YEAR, getPreviousSchoolYear(YEAR)] } } })
})

async function setTrialWeek(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  await db.trialWeek.upsert({
    where: { schoolYear_city: { schoolYear: YEAR, city } },
    create: {
      schoolYear: YEAR,
      city,
      startDate: fromDateKey(WEEK_START),
      endDate: fromDateKey(WEEK_END),
    },
    update: { startDate: fromDateKey(WEEK_START), endDate: fromDateKey(WEEK_END) },
  })
}

const groupOn = (
  kind: 'STANDARD' | 'RADIONICA' | 'COMPETITION',
  overrides: { schoolYear?: string; city?: 'SPLIT' | 'SIBENIK'; dayOfWeek?: string | null } = {},
) => ({
  dayOfWeek: overrides.dayOfWeek === undefined ? 'Utorak' : overrides.dayOfWeek,
  schoolYear: overrides.schoolYear ?? YEAR,
  city: overrides.city ?? ('SPLIT' as const),
  course: { kind },
})

describe('resolveTrialDateForGroup', () => {
  it('resolves the weekday inside the trial week for a STANDARD group', async () => {
    await setTrialWeek()
    const date = await resolveTrialDateForGroup(groupOn('STANDARD'))
    expect(date && toDateKey(date)).toBe(TUESDAY)
  })

  /**
   * The STANDARD-only rule. A radionica IS a one-off trial of its own and the
   * competitive program is invitation-only, so neither offers one — and both
   * fixtures carry the SAME weekday as the passing case above, so program kind
   * is the only variable.
   */
  it('refuses a radionica and the competitive program', async () => {
    await setTrialWeek()
    expect(await resolveTrialDateForGroup(groupOn('RADIONICA'))).toBeNull()
    expect(await resolveTrialDateForGroup(groupOn('COMPETITION'))).toBeNull()
  })

  it('is keyed on the GROUP’s own school year, not today’s', async () => {
    await setTrialWeek()
    const other = groupOn('STANDARD', { schoolYear: '2019/2020' })
    expect(await resolveTrialDateForGroup(other)).toBeNull()
    expect(await resolveTrialDateForGroup(groupOn('STANDARD'))).not.toBeNull()
  })

  /** Šibenik plans its own week; Split's must not leak across the tenant line. */
  it('does not read the other city’s trial week', async () => {
    await setTrialWeek('SIBENIK')
    expect(await resolveTrialDateForGroup(groupOn('STANDARD', { city: 'SPLIT' }))).toBeNull()
    expect(await resolveTrialDateForGroup(groupOn('STANDARD', { city: 'SIBENIK' }))).not.toBeNull()
  })

  it('yields nothing for a group with no weekday', async () => {
    await setTrialWeek()
    expect(await resolveTrialDateForGroup(groupOn('STANDARD', { dayOfWeek: null }))).toBeNull()
  })

  /**
   * An ABSENT row is the "no probni sat this year" state — the same doctrine as
   * CourseGradeRule. It is also why the feature is dark until an admin sets a
   * week, which is a deliberate default and not a bug.
   */
  it('yields nothing when the year has no trial week at all', async () => {
    expect(await resolveTrialDateForGroup(groupOn('STANDARD'))).toBeNull()
  })

  /** A holiday on the group's day REMOVES its trial rather than moving it. */
  it('drops the trial when a holiday lands on the group’s weekday', async () => {
    await setTrialWeek()
    await createLocation({ city: 'SPLIT' })
    await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
    await db.schoolYearHoliday.create({
      data: { schoolYear: YEAR, city: 'SPLIT', date: fromDateKey(TUESDAY), name: 'Test praznik' },
    })
    try {
      expect(await resolveTrialDateForGroup(groupOn('STANDARD'))).toBeNull()
      // Same date, other city: the holiday set is per-city, so Šibenik keeps it.
      await setTrialWeek('SIBENIK')
      expect(
        await resolveTrialDateForGroup(groupOn('STANDARD', { city: 'SIBENIK' })),
      ).not.toBeNull()
    } finally {
      await db.schoolYearHoliday.deleteMany({
        where: { schoolYear: YEAR, city: 'SPLIT', date: fromDateKey(TUESDAY) },
      })
    }
  })
})

describe('upsertTrialWeek / clearTrialWeek', () => {
  async function asAdmin(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
    const admin = await createAdmin({ city })
    mockSession({ id: admin.id, role: 'ADMIN', city })
    return admin
  }

  it('stores a week an admin sets, under their own city', async () => {
    await asAdmin('SPLIT')
    const res = await upsertTrialWeek({
      schoolYear: YEAR,
      startDate: WEEK_START,
      endDate: WEEK_END,
    })
    expect(res.success).toBe(true)

    const row = await db.trialWeek.findUnique({
      where: { schoolYear_city: { schoolYear: YEAR, city: 'SPLIT' } },
    })
    expect(row).not.toBeNull()
    // The city comes from the session, never from the payload.
    expect(
      await db.trialWeek.findUnique({
        where: { schoolYear_city: { schoolYear: YEAR, city: 'SIBENIK' } },
      }),
    ).toBeNull()
  })

  /**
   * "Probni tjedan" is a week because every group runs its trial on its own
   * weekday inside it — an 8-day span would give some weekday two candidate
   * dates and `computeTrialSession` would silently pick one.
   */
  it('refuses a span longer than 7 days, and writes nothing', async () => {
    await asAdmin('SPLIT')
    const res = await upsertTrialWeek({
      schoolYear: YEAR,
      startDate: WEEK_START,
      endDate: dateKey(new Date(TRIAL_MONDAY.getTime() + 7 * dayMs)),
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/najviše 7 dana/)
    expect(
      await db.trialWeek.findUnique({
        where: { schoolYear_city: { schoolYear: YEAR, city: 'SPLIT' } },
      }),
    ).toBeNull()
  })

  it('refuses an end before the start', async () => {
    await asAdmin('SPLIT')
    const res = await upsertTrialWeek({
      schoolYear: YEAR,
      startDate: WEEK_END,
      endDate: WEEK_START,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/prije početka/)
  })

  it('refuses an archived school year', async () => {
    await asAdmin('SPLIT')
    const past = getPreviousSchoolYear(YEAR)
    const res = await upsertTrialWeek({
      schoolYear: past,
      startDate: WEEK_START,
      endDate: WEEK_END,
    })
    expect(res.success).toBe(false)
    expect(
      await db.trialWeek.findUnique({
        where: { schoolYear_city: { schoolYear: past, city: 'SPLIT' } },
      }),
    ).toBeNull()
  })

  it('rejects a non-admin caller', async () => {
    mockSession({ id: 'nastavnik', role: 'TEACHER', city: 'SPLIT' })
    await expect(
      upsertTrialWeek({ schoolYear: YEAR, startDate: WEEK_START, endDate: WEEK_END }),
    ).rejects.toThrow()
  })

  /** Clearing DELETES the row — absence is the "no trial this year" state. */
  it('clears by deleting the row, not by blanking the dates', async () => {
    await asAdmin('SPLIT')
    await setTrialWeek('SPLIT')

    const res = await clearTrialWeek({ schoolYear: YEAR })
    expect(res.success).toBe(true)
    expect(
      await db.trialWeek.findUnique({
        where: { schoolYear_city: { schoolYear: YEAR, city: 'SPLIT' } },
      }),
    ).toBeNull()
    // And the public consequence: groups stop offering a date immediately.
    expect(await resolveTrialDateForGroup(groupOn('STANDARD'))).toBeNull()
  })

  it('reads back only its own city’s week', async () => {
    await setTrialWeek('SIBENIK')
    await asAdmin('SPLIT')
    expect(await getTrialWeek(YEAR)).toBeNull()

    await asAdmin('SIBENIK')
    expect(await getTrialWeek(YEAR)).not.toBeNull()
  })
})
