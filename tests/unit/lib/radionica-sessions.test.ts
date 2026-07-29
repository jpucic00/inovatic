import { describe, expect, it } from 'vitest'
import {
  computeRadionicaSessions,
  isRadionicaOpenForSignup,
  toDateKey,
} from '@/lib/session-dates'
import { computeWorkshopLabels } from '@/lib/school-year-planner'

describe('computeRadionicaSessions', () => {
  it('returns one session per day in a closed inclusive range (skipping Sundays)', () => {
    // 2026-07-15..21 — Sunday lands on 2026-07-19 and drops out.
    const sessions = computeRadionicaSessions({
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
    })
    expect(sessions.map(toDateKey)).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-20',
      '2026-07-21',
    ])
  })

  it('returns a single date when dateStart === dateEnd', () => {
    const sessions = computeRadionicaSessions({
      dateStart: '2026-07-15',
      dateEnd: '2026-07-15',
    })
    expect(sessions.map(toDateKey)).toEqual(['2026-07-15'])
  })

  it('skips dates that appear in the holiday set', () => {
    const sessions = computeRadionicaSessions({
      dateStart: '2026-07-15',
      dateEnd: '2026-07-18',
      holidayDates: new Set(['2026-07-16']),
    })
    expect(sessions.map(toDateKey)).toEqual(['2026-07-15', '2026-07-17', '2026-07-18'])
  })

  it('skips Sundays (association never schedules workshops on Nedjelja)', () => {
    // 2026-07-19 is a Sunday — Mon 13 → Sun 19 of the same week.
    const sessions = computeRadionicaSessions({
      dateStart: '2026-07-13',
      dateEnd: '2026-07-19',
    })
    expect(sessions.map(toDateKey)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ])
  })

  it('returns an empty list when the entire range is a single Sunday', () => {
    expect(
      computeRadionicaSessions({ dateStart: '2026-07-19', dateEnd: '2026-07-19' }).map(
        toDateKey,
      ),
    ).toEqual([])
  })

  it('returns an empty list when either bound is missing', () => {
    expect(computeRadionicaSessions({ dateStart: null, dateEnd: '2026-07-21' })).toEqual([])
    expect(computeRadionicaSessions({ dateStart: '2026-07-15', dateEnd: null })).toEqual([])
  })

  it('returns an empty list when dateEnd is before dateStart', () => {
    expect(
      computeRadionicaSessions({ dateStart: '2026-07-21', dateEnd: '2026-07-15' }),
    ).toEqual([])
  })
})

describe('isRadionicaOpenForSignup', () => {
  // 2026-07-15 12:00 UTC → 14:00 in Zagreb (CEST), so "today" is 2026-07-15.
  const MIDDAY = new Date('2026-07-15T12:00:00Z')

  it('offers a workshop whose first day is still ahead', () => {
    expect(isRadionicaOpenForSignup('2026-07-16', MIDDAY)).toBe(true)
    expect(isRadionicaOpenForSignup('2026-12-01', MIDDAY)).toBe(true)
  })

  it('stops offering it on its own start day', () => {
    expect(isRadionicaOpenForSignup('2026-07-15', MIDDAY)).toBe(false)
  })

  it('stops offering a workshop that has already run', () => {
    expect(isRadionicaOpenForSignup('2026-07-14', MIDDAY)).toBe(false)
    expect(isRadionicaOpenForSignup('2025-01-02', MIDDAY)).toBe(false)
  })

  it('keeps a dateless group bookable — nothing to compare against', () => {
    expect(isRadionicaOpenForSignup(null, MIDDAY)).toBe(true)
  })

  it('flips on the Zagreb calendar day, not the UTC one', () => {
    // 22:30 UTC on the 14th is already 00:30 on the 15th in Zagreb, so a
    // workshop starting the 15th is no longer offered.
    const lateNight = new Date('2026-07-14T22:30:00Z')
    expect(isRadionicaOpenForSignup('2026-07-15', lateNight)).toBe(false)
    expect(isRadionicaOpenForSignup('2026-07-16', lateNight)).toBe(true)
  })
})

describe('computeWorkshopLabels', () => {
  it('emits one label per (day, course title) inside the date range', () => {
    const labels = computeWorkshopLabels({
      radionicaGroups: [
        { dateStart: '2026-07-15', dateEnd: '2026-07-17', courseTitle: 'Ljetna robotika' },
      ],
    })
    expect(labels).toEqual([
      { date: '2026-07-15', title: 'Ljetna robotika' },
      { date: '2026-07-16', title: 'Ljetna robotika' },
      { date: '2026-07-17', title: 'Ljetna robotika' },
    ])
  })

  it('dedupes two groups of the same workshop on the same day to a single label', () => {
    const labels = computeWorkshopLabels({
      radionicaGroups: [
        { dateStart: '2026-07-15', dateEnd: '2026-07-15', courseTitle: 'Ljetna robotika' },
        { dateStart: '2026-07-15', dateEnd: '2026-07-15', courseTitle: 'Ljetna robotika' },
      ],
    })
    expect(labels).toEqual([{ date: '2026-07-15', title: 'Ljetna robotika' }])
  })

  it('stacks multiple distinct workshops on the same day, sorted alphabetically', () => {
    const labels = computeWorkshopLabels({
      radionicaGroups: [
        { dateStart: '2026-07-15', dateEnd: '2026-07-15', courseTitle: 'Drone radionica' },
        { dateStart: '2026-07-15', dateEnd: '2026-07-15', courseTitle: 'Arduino radionica' },
      ],
    })
    expect(labels).toEqual([
      { date: '2026-07-15', title: 'Arduino radionica' },
      { date: '2026-07-15', title: 'Drone radionica' },
    ])
  })

  it('ignores groups missing either bound', () => {
    const labels = computeWorkshopLabels({
      radionicaGroups: [
        { dateStart: null, dateEnd: '2026-07-21', courseTitle: 'Bad data' },
        { dateStart: '2026-07-15', dateEnd: null, courseTitle: 'Also bad' },
      ],
    })
    expect(labels).toEqual([])
  })

  it('skips Sundays when computing calendar labels', () => {
    // 2026-07-12 = Sunday, 2026-07-19 = Sunday. Range covers both — neither
    // should get a label.
    const labels = computeWorkshopLabels({
      radionicaGroups: [
        { dateStart: '2026-07-12', dateEnd: '2026-07-19', courseTitle: 'Ljetna robotika' },
      ],
    })
    expect(labels.map((l) => l.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ])
  })
})
