/**
 * `buildPublicSchedule` — the `/raspored` reading of the signup feed.
 *
 * The feed itself (windows, capacity, cutoffs) is covered in the integration
 * tier; this is the shaping on top: weekday buckets, time order, radionice set
 * apart, and the one rule the page adds — same program + same day + same time
 * is ONE slot, because with group names hidden two would read as a duplicate.
 */
import { describe, expect, it } from 'vitest'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import { buildPublicSchedule, formatVenue } from '@/lib/public-schedule'

const VENUE = { locationName: 'Velebitska 32', locationAddress: 'Velebitska 32, 21000 Split' }

let seq = 0
function group(overrides: Partial<ActiveGroup> = {}): ActiveGroup {
  seq += 1
  return {
    id: `g${seq}`,
    name: `Grupa ${seq}`,
    dayOfWeek: 'Ponedjeljak',
    dateStart: null,
    dateEnd: null,
    startTime: '17:00',
    endTime: '18:30',
    availableSpots: 4,
    isFull: false,
    ...VENUE,
    ...overrides,
  }
}

function program(overrides: Partial<ActiveProgram> & { groups: ActiveGroup[] }): ActiveProgram {
  return {
    id: 'slr-1',
    slug: 'slr-1',
    title: 'Svijet LEGO Robotike 1',
    level: 'SLR_1',
    kind: 'STANDARD',
    ageMin: 7,
    ageMax: 8,
    price: null,
    ...overrides,
  }
}

const slotsOf = (schedule: ReturnType<typeof buildPublicSchedule>, day: string) =>
  schedule.weekly.find((d) => d.label === day)?.slots ?? []

describe('buildPublicSchedule — merging', () => {
  it('collapses two groups of one program on the same day and time into one slot with summed spots', () => {
    const schedule = buildPublicSchedule([
      program({
        groups: [
          group({ name: 'SLR 1 A', availableSpots: 3 }),
          group({ name: 'SLR 1 B', availableSpots: 5 }),
        ],
      }),
    ])

    const monday = slotsOf(schedule, 'Ponedjeljak')
    expect(monday).toHaveLength(1)
    expect(monday[0].availableSpots).toBe(8)
    expect(monday[0].isFull).toBe(false)
    expect(monday[0].programTitle).toBe('Svijet LEGO Robotike 1')
    // Nothing on the slot can leak a group name.
    expect(JSON.stringify(monday[0])).not.toContain('SLR 1 A')
  })

  it('is full only when every merged group is full', () => {
    const both = buildPublicSchedule([
      program({
        groups: [
          group({ availableSpots: 0, isFull: true }),
          group({ availableSpots: 0, isFull: true }),
        ],
      }),
    ])
    expect(slotsOf(both, 'Ponedjeljak')[0].isFull).toBe(true)

    const one = buildPublicSchedule([
      program({
        groups: [group({ availableSpots: 0, isFull: true }), group({ availableSpots: 2 })],
      }),
    ])
    expect(slotsOf(one, 'Ponedjeljak')[0]).toMatchObject({ availableSpots: 2, isFull: false })
  })

  it('keeps groups apart when the day, the time or the program differs', () => {
    const schedule = buildPublicSchedule([
      program({
        groups: [
          group({ dayOfWeek: 'Ponedjeljak', startTime: '17:00', endTime: '18:30' }),
          group({ dayOfWeek: 'Ponedjeljak', startTime: '18:30', endTime: '20:00' }),
          group({ dayOfWeek: 'Utorak', startTime: '17:00', endTime: '18:30' }),
        ],
      }),
      program({
        id: 'slr-2',
        slug: 'slr-2',
        title: 'Svijet LEGO Robotike 2',
        groups: [group({ dayOfWeek: 'Ponedjeljak', startTime: '17:00', endTime: '18:30' })],
      }),
    ])

    expect(slotsOf(schedule, 'Ponedjeljak')).toHaveLength(3)
    expect(slotsOf(schedule, 'Utorak')).toHaveLength(1)
  })

  it('unions the venues of merged groups and lists every venue of the page', () => {
    const schedule = buildPublicSchedule([
      program({
        groups: [
          group(),
          group({ locationName: 'PMF', locationAddress: 'Ruđera Boškovića 33, 21000 Split' }),
        ],
      }),
    ])
    const slot = slotsOf(schedule, 'Ponedjeljak')[0]
    expect(slot.venues).toEqual([
      'Velebitska 32, 21000 Split',
      'PMF · Ruđera Boškovića 33, 21000 Split',
    ])
    expect(schedule.venues).toEqual(slot.venues)
  })
})

describe('buildPublicSchedule — ordering and buckets', () => {
  it('walks Ponedjeljak–Subota in order, sorts a day by start time, then by feed order', () => {
    const schedule = buildPublicSchedule([
      program({
        groups: [
          group({ dayOfWeek: 'Srijeda', startTime: '18:30', endTime: '20:00' }),
          group({ dayOfWeek: 'Srijeda', startTime: '09:00', endTime: '10:30' }),
        ],
      }),
      program({
        id: 'uvod',
        slug: 'uvod-u-svijet-lego-robotike',
        title: 'Uvod',
        groups: [group({ dayOfWeek: 'Srijeda', startTime: '09:00', endTime: '10:00' })],
      }),
    ])

    expect(schedule.weekly.map((d) => d.label)).toEqual([
      'Ponedjeljak',
      'Utorak',
      'Srijeda',
      'Četvrtak',
      'Petak',
      'Subota',
    ])
    // Same start time: the feed's own order (the catalog's sortOrder) breaks the tie.
    expect(slotsOf(schedule, 'Srijeda').map((s) => [s.time, s.programSlug])).toEqual([
      ['09:00–10:30', 'slr-1'],
      ['09:00–10:00', 'uvod-u-svijet-lego-robotike'],
      ['18:30–20:00', 'slr-1'],
    ])
    expect(slotsOf(schedule, 'Ponedjeljak')).toEqual([])
  })

  it('shows Nedjelja only when a group actually runs on it', () => {
    const withSunday = buildPublicSchedule([program({ groups: [group({ dayOfWeek: 'Nedjelja' })] })])
    expect(withSunday.weekly.map((d) => d.label)).toContain('Nedjelja')
    expect(withSunday.weekly).toHaveLength(7)
  })

  it('sets radionice apart, keyed on their date range, in date order', () => {
    const schedule = buildPublicSchedule([
      program({
        id: 'r',
        slug: 'ljetna-radionica',
        title: 'Ljetna radionica',
        kind: 'RADIONICA',
        ageMin: 7,
        ageMax: 10,
        groups: [
          group({ dayOfWeek: null, dateStart: '2026-11-02', dateEnd: '2026-11-06', startTime: '09:00', endTime: '12:00', availableSpots: 5 }),
          group({ dayOfWeek: null, dateStart: '2026-10-26', dateEnd: '2026-10-30', startTime: '09:00', endTime: '12:00', availableSpots: 1 }),
          group({ dayOfWeek: null, dateStart: '2026-10-26', dateEnd: '2026-10-30', startTime: '09:00', endTime: '12:00', availableSpots: 2 }),
        ],
      }),
    ])

    expect(schedule.weekly.every((d) => d.slots.length === 0)).toBe(true)
    expect(schedule.radionice.map((s) => [s.dates, s.time, s.availableSpots])).toEqual([
      ['26.10.2026. – 30.10.2026.', '09:00–12:00', 3],
      ['02.11.2026. – 06.11.2026.', '09:00–12:00', 5],
    ])
    expect(schedule.radionice[0].badge).toBeNull()
    expect(schedule.isEmpty).toBe(false)
  })

  it('gives a standard program its catalog badge', () => {
    const schedule = buildPublicSchedule([program({ groups: [group()] })])
    expect(slotsOf(schedule, 'Ponedjeljak')[0].badge).toBe('1')
  })

  it('parks a weekly group with no weekday under "Dan u dogovoru" instead of dropping it', () => {
    const schedule = buildPublicSchedule([program({ groups: [group({ dayOfWeek: null })] })])
    const last = schedule.weekly.at(-1)
    expect(last?.label).toBe('Dan u dogovoru')
    expect(last?.slots).toHaveLength(1)
  })

  it('is empty with no programs and with programs that have no groups', () => {
    expect(buildPublicSchedule([]).isEmpty).toBe(true)
    expect(buildPublicSchedule([program({ groups: [] })]).isEmpty).toBe(true)
  })
})

describe('formatVenue', () => {
  it('prints the address alone when it already names the venue', () => {
    expect(formatVenue('Velebitska 32', 'Velebitska 32, 21000 Split')).toBe('Velebitska 32, 21000 Split')
  })
  it('prefixes the venue name otherwise', () => {
    expect(formatVenue('Trokut inkubator', 'Ul. Velimira Škorpika 7/a, 22000 Šibenik')).toBe(
      'Trokut inkubator · Ul. Velimira Škorpika 7/a, 22000 Šibenik',
    )
  })
  it('falls back to whichever half exists', () => {
    expect(formatVenue('Trokut', '')).toBe('Trokut')
    expect(formatVenue('', 'Neka ulica 1')).toBe('Neka ulica 1')
  })
})
