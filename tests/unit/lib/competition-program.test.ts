import { describe, it, expect } from 'vitest'
import { computeSeasonSessions, toDateKey } from '@/lib/session-dates'
import { seasonMonths } from '@/lib/monthly-charges'
import { isEnrollmentPending, pendingEnrollmentWhere } from '@/lib/payment-status'
import type { PaymentStatusEnrollment } from '@/lib/payment-status'
import { programsForSelection } from '@/lib/inquiry-availability'
import type { ActiveProgram } from '@/actions/public/programs'
import { isHighSchoolGrade, GRADE_SORT_KEY, GRADE_LABELS } from '@/lib/inquiry-status'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const keys = (dates: Date[]) => dates.map(toDateKey)

// ─── Season sessions: one a week, holidays drop the week ─────────────────────

describe('computeSeasonSessions', () => {
  it('emits one session a week on the group weekday across the season', () => {
    // 2026-09-15 is a Tuesday.
    const sessions = computeSeasonSessions({
      dayOfWeek: 'Utorak',
      startDate: d('2026-09-15'),
      endDate: d('2026-10-13'),
    })
    expect(keys(sessions)).toEqual([
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
      '2026-10-06',
      '2026-10-13',
    ])
  })

  it('drops a holiday week outright instead of shifting it', () => {
    const sessions = computeSeasonSessions({
      dayOfWeek: 'Utorak',
      startDate: d('2026-09-15'),
      endDate: d('2026-10-13'),
      holidayDates: new Set(['2026-09-29']),
    })
    // Four sessions, and the season still ends on the same date — the missed
    // week is simply not made up.
    expect(keys(sessions)).toEqual([
      '2026-09-15',
      '2026-09-22',
      '2026-10-06',
      '2026-10-13',
    ])
  })

  it('lets two weekdays legitimately finish with different session counts', () => {
    const common = { startDate: d('2026-09-14'), endDate: d('2026-10-13') }
    const holidayDates = new Set(['2026-09-21', '2026-09-28'])
    const mon = computeSeasonSessions({ dayOfWeek: 'Ponedjeljak', ...common, holidayDates })
    const tue = computeSeasonSessions({ dayOfWeek: 'Utorak', ...common, holidayDates })
    expect(mon.length).toBe(3)
    expect(tue.length).toBe(5)
  })

  it('returns nothing when the season is unplanned or the weekday is missing', () => {
    expect(computeSeasonSessions({ dayOfWeek: 'Utorak', startDate: null, endDate: null })).toEqual([])
    expect(
      computeSeasonSessions({ dayOfWeek: null, startDate: d('2026-09-15'), endDate: d('2027-06-15') }),
    ).toEqual([])
  })
})

// ─── Monthly charges ─────────────────────────────────────────────────────────

describe('seasonMonths', () => {
  it('covers every calendar month the season touches, first-of-month in UTC', () => {
    const months = seasonMonths(d('2026-09-15'), d('2026-12-05'))
    expect(keys(months)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'])
  })

  it('crosses the calendar-year boundary', () => {
    const months = seasonMonths(d('2026-11-10'), d('2027-02-03'))
    expect(keys(months)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
  })

  it('floors at the join month, so a mid-season child never owes earlier months', () => {
    const months = seasonMonths(d('2026-09-15'), d('2027-06-15'), d('2027-01-20'))
    expect(keys(months)).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
    ])
  })

  it('ignores a join date before the season — the season start still wins', () => {
    const months = seasonMonths(d('2026-09-15'), d('2026-10-31'), d('2026-06-01'))
    expect(keys(months)).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('yields nothing once the join date is past the season end', () => {
    expect(seasonMonths(d('2026-09-15'), d('2027-06-15'), d('2027-08-01'))).toEqual([])
  })

  it('bills nothing while the season is unplanned', () => {
    expect(seasonMonths(null, d('2027-06-15'))).toEqual([])
    expect(seasonMonths(d('2026-09-15'), null)).toEqual([])
  })
})

// ─── Payment status: the COMPETITION arm ─────────────────────────────────────

const NOW = d('2026-11-15')

function competitionEnrollment(
  months: { periodStart: Date; paidAt: Date | null }[],
  fullYearPaidAt: Date | null = null,
): PaymentStatusEnrollment {
  return {
    schoolYear: '2026/2027',
    fullYearPaidAt,
    scheduledGroup: { course: { kind: 'COMPETITION' } },
    moduleEnrollments: [],
    enrollmentMonths: months,
  }
}

describe('isEnrollmentPending — competition', () => {
  it('owes money once a started month is unpaid', () => {
    const e = competitionEnrollment([
      { periodStart: d('2026-10-01'), paidAt: d('2026-10-03') },
      { periodStart: d('2026-11-01'), paidAt: null },
    ])
    expect(isEnrollmentPending(e, NOW)).toBe(true)
  })

  it('owes nothing while only future months are unpaid', () => {
    const e = competitionEnrollment([
      { periodStart: d('2026-10-01'), paidAt: d('2026-10-03') },
      { periodStart: d('2026-11-01'), paidAt: d('2026-11-02') },
      { periodStart: d('2026-12-01'), paidAt: null },
    ])
    expect(isEnrollmentPending(e, NOW)).toBe(false)
  })

  it('flips to owed the moment the 1st arrives, with no job to run', () => {
    const e = competitionEnrollment([{ periodStart: d('2026-12-01'), paidAt: null }])
    expect(isEnrollmentPending(e, d('2026-11-30'))).toBe(false)
    expect(isEnrollmentPending(e, d('2026-12-01'))).toBe(true)
  })

  it('is covered by the whole-year paid mark', () => {
    const e = competitionEnrollment([{ periodStart: d('2026-10-01'), paidAt: null }], d('2026-09-20'))
    expect(isEnrollmentPending(e, NOW)).toBe(false)
  })

  it('owes nothing while the season is unplanned (no months exist yet)', () => {
    expect(isEnrollmentPending(competitionEnrollment([]), NOW)).toBe(false)
  })
})

describe('pendingEnrollmentWhere — competition arm mirrors isEnrollmentPending', () => {
  it('gates the month check on the program kind', () => {
    const where = pendingEnrollmentWhere(NOW)
    const arm = (where.OR as Record<string, unknown>[]).find((o) => 'enrollmentMonths' in o)
    expect(arm).toBeDefined()
    expect(arm).toMatchObject({
      scheduledGroup: { course: { kind: 'COMPETITION' } },
      enrollmentMonths: { some: { paidAt: null, periodStart: { lte: NOW } } },
    })
  })
})

// ─── Grades ──────────────────────────────────────────────────────────────────

describe('high-school grades', () => {
  it('recognises exactly the four srednja škola values', () => {
    expect(isHighSchoolGrade('ss1')).toBe(true)
    expect(isHighSchoolGrade('ss4')).toBe(true)
    expect(isHighSchoolGrade('8')).toBe(false)
    expect(isHighSchoolGrade('predskolci')).toBe(false)
  })

  it('sorts after 8. razred in the admin table', () => {
    expect(GRADE_SORT_KEY.ss1).toBeGreaterThan(GRADE_SORT_KEY['8'])
    expect(GRADE_SORT_KEY.ss4).toBeGreaterThan(GRADE_SORT_KEY.ss1)
  })

  it('has a Croatian label for every one', () => {
    expect(GRADE_LABELS.ss1).toBe('Srednja škola – 1. razred')
    expect(GRADE_LABELS.ss4).toBe('Srednja škola – 4. razred')
  })
})

// ─── The invite-link guarantee ───────────────────────────────────────────────

function program(id: string, level: string | null, kind: ActiveProgram['kind']): ActiveProgram {
  return {
    id,
    slug: id,
    title: id,
    level,
    kind,
    ageMin: 6,
    ageMax: 14,
    price: null,
    groups: [],
  }
}

describe('programsForSelection — per-program signup links', () => {
  const slr1 = program('slr-1', 'SLR_1', 'STANDARD')
  const slr2 = program('slr-2', 'SLR_2', 'STANDARD')
  const competition = program('natjecateljski-program', null, 'COMPETITION')
  const all = [slr1, slr2, competition]

  it('narrows by grade on the public catalog', () => {
    // 2. razred maps to SLR 1 — this is the rule an invite link must bypass.
    expect(programsForSelection(all, '2')).toEqual([slr1])
  })

  it('offers the linked program for EVERY grade, so an SLR 1 graduate in 2. razred can be invited to SLR 2', () => {
    for (const grade of ['predskolci', '2', '5', '8'] as const) {
      expect(programsForSelection(all, grade, 'slr-2')).toEqual([slr2])
    }
  })

  it('keeps the competitive program out of the grade-driven catalog', () => {
    expect(programsForSelection(all, '8')).not.toContain(competition)
    expect(programsForSelection(all, undefined)).not.toContain(competition)
  })

  it('serves the competitive program through its own link, for a srednja škola grade too', () => {
    expect(programsForSelection(all, 'ss2', 'natjecateljski-program')).toEqual([competition])
  })

  it('matches no SLR program for a srednja škola grade on the public catalog', () => {
    expect(programsForSelection(all, 'ss1')).toEqual([])
  })
})
