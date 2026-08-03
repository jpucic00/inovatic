import { describe, expect, it } from 'vitest'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'

const SCHOOL_YEAR = '2026/2027'

type Mod = Parameters<typeof getCurrentActiveModuleForGroup>[0]['modules'][number]

function mkModule(
  id: string,
  sortOrder: number,
  schedule: { startDate: Date | null; endDate: Date | null } | null,
): Mod {
  return {
    id,
    title: id,
    sortOrder,
    schedules: schedule
      ? [
          {
            id: `${id}-sched`,
            schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
          },
        ]
      : [],
  }
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/**
 * Helper for the typical four-module standard course shape. Module windows
 * mirror the planner output for a 2026-09-01 kickoff so the resulting arcs
 * have predictable per-weekday sessions.
 */
const STD_MODULES: Mod[] = [
  mkModule('M1', 0, { startDate: utc(2026, 9, 1), endDate: utc(2026, 10, 19) }),
  mkModule('M2', 1, { startDate: utc(2026, 10, 20), endDate: utc(2026, 12, 7) }),
  mkModule('M3', 2, { startDate: utc(2026, 12, 8), endDate: utc(2027, 1, 25) }),
  mkModule('M4', 3, { startDate: utc(2027, 1, 26), endDate: utc(2027, 3, 15) }),
]

describe('getCurrentActiveModuleForGroup', () => {
  it('returns null for an empty module list (radionice)', () => {
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules: [],
        schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
        holidayDates: new Set(),
        now: utc(2026, 10, 15),
      }),
    ).toBeNull()
  })

  it('picks the in-progress module when asOfDate is inside an arc entry', () => {
    const result = getCurrentActiveModuleForGroup({
      kind: 'STANDARD',
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
      holidayDates: new Set(),
      now: utc(2026, 11, 18), // Mid-Module-2 for Wed (M2 window Nov 4 - Dec 16)
    })
    expect(result?.id).toBe('M2')
  })

  it('picks the most-recently-completed module during off-session weeks', () => {
    // Wed M1 lastSession = 14.10. Wed M2 firstSession = 21.10. On 16.10, no
    // module is in progress for Wed — fall back to last completed.
    const result = getCurrentActiveModuleForGroup({
      kind: 'STANDARD',
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
      holidayDates: new Set(),
      now: utc(2026, 10, 16),
    })
    expect(result?.id).toBe('M1')
  })

  it('picks the next-enrolling module before the arc starts (pre-school-year)', () => {
    const result = getCurrentActiveModuleForGroup({
      kind: 'STANDARD',
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
      holidayDates: new Set(),
      now: utc(2026, 8, 15),
    })
    expect(result?.id).toBe('M1')
  })

  it('falls back to first-by-sortOrder when no schedules exist for the year', () => {
    const modules = [
      mkModule('M3', 2, null),
      mkModule('M1', 0, null),
      mkModule('M2', 1, null),
    ]
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules,
        schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
        holidayDates: new Set(),
        now: utc(2026, 10, 15),
      })?.id,
    ).toBe('M1')
  })

  it('falls back to first-by-sortOrder when dayOfWeek is null (radionica with modules — unusual but handled)', () => {
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: null,
        modules: STD_MODULES,
        schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
        holidayDates: new Set(),
        now: utc(2026, 10, 15),
      })?.id,
    ).toBe('M1')
  })

  it('Mon (2 holidays in M1) and Wed (no holidays) yield different active modules on the same date', () => {
    // Holidays land on Mondays inside Module 1 — Mon's arc shifts later, Wed's
    // is unaffected. On 30.10 Wed is mid-Module-2 and Mon is still in M1.
    const holidays = new Set(['2026-09-21', '2026-10-05'])
    const wed = getCurrentActiveModuleForGroup({
      kind: 'STANDARD',
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
      holidayDates: holidays,
      now: utc(2026, 11, 4),
    })
    const mon = getCurrentActiveModuleForGroup({
      kind: 'STANDARD',
      dayOfWeek: 'Ponedjeljak',
      modules: STD_MODULES,
      schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
      holidayDates: holidays,
      now: utc(2026, 11, 4),
    })
    expect(wed?.id).toBe('M2')
    expect(mon?.id).toBe('M1')
  })

  it('returns the most-recent module past the last session of the arc', () => {
    // Past 2027-03-15, Wed is "done" — last completed = M4.
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules: STD_MODULES,
        schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
        holidayDates: new Set(),
        now: utc(2027, 5, 1),
      })?.id,
    ).toBe('M4')
  })

  it('ignores schedules for a different schoolYear', () => {
    // Only schedule belongs to 2025/2026 — for 2026/2027 there's no schedule
    // → arc is empty → falls back to first-by-sortOrder.
    const modules: Mod[] = [
      {
        id: 'M1',
        title: 'M1',
        sortOrder: 0,
        schedules: [
          {
            id: 'M1-sched',
            schoolYear: '2025/2026',
            city: 'SPLIT',
            startDate: utc(2026, 10, 1),
            endDate: utc(2026, 10, 31),
          },
        ],
      },
      mkModule('M2', 1, null),
    ]
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules,
        schoolYear: '2026/2027',
        city: 'SPLIT',
        holidayDates: new Set(),
        now: utc(2026, 10, 15),
      })?.id,
    ).toBe('M1')
  })

  it("ignores the other city's schedule for the same schoolYear", () => {
    // Both modules carry ONLY Šibenik schedules; at `now` M2's Šibenik window
    // is in progress. A SPLIT group must ignore them entirely (arc empty →
    // fallback M1). Pairing with the wrong city's dates would pick M2.
    const sibenikSchedule = (
      id: string,
      startDate: Date,
      endDate: Date,
    ): Mod['schedules'][number] => ({
      id,
      schoolYear: SCHOOL_YEAR,
      city: 'SIBENIK',
      startDate,
      endDate,
    })
    const modules: Mod[] = [
      {
        id: 'M1',
        title: 'M1',
        sortOrder: 0,
        schedules: [sibenikSchedule('M1-sib', utc(2026, 9, 1), utc(2026, 10, 19))],
      },
      {
        id: 'M2',
        title: 'M2',
        sortOrder: 1,
        schedules: [sibenikSchedule('M2-sib', utc(2026, 10, 20), utc(2026, 12, 7))],
      },
    ]
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules,
        schoolYear: SCHOOL_YEAR,
        city: 'SPLIT',
        holidayDates: new Set(),
        now: utc(2026, 11, 15),
      })?.id,
    ).toBe('M1')
  })

  it('defaults `now` to current time when not supplied', () => {
    // Very wide window covering year 1900–2200 — arc covers any "now". Pick
    // the first module since every other module is null.
    const modules = [
      mkModule('M1', 0, { startDate: utc(1900, 1, 1), endDate: utc(2200, 12, 31) }),
      mkModule('M2', 1, null),
      mkModule('M3', 2, null),
      mkModule('M4', 3, null),
    ]
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'STANDARD',
        dayOfWeek: 'Srijeda',
        modules,
        schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
        holidayDates: new Set(),
      })?.id,
    ).toBe('M1')
  })

  it('returns null for COMPETITION even with dated schedules — natjecanja are never narrowed', () => {
    // Identical input picks M2 for STANDARD (asserted above); the kind guard
    // alone must turn it off, otherwise the app would narrow a competition
    // group's materials/gallery to one "active" natjecanje.
    expect(
      getCurrentActiveModuleForGroup({
        kind: 'COMPETITION',
        dayOfWeek: 'Srijeda',
        modules: STD_MODULES,
        schoolYear: SCHOOL_YEAR,
        city: 'SPLIT' as const,
        holidayDates: new Set(),
        now: utc(2026, 11, 18),
      }),
    ).toBeNull()
  })
})
