import { describe, expect, it } from 'vitest'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import {
  computeModuleMarkers,
  computeSchoolYearPlan,
  deriveSessionDatesFromWindows,
} from '@/lib/school-year-planner'

// Tue Sept 1, 2026 is the canonical kickoff used across these tests. The
// concrete dates below were hand-rolled forward against a 7-days-per-module
// curriculum with no holidays — easier to read than re-deriving them from
// JS Date in the assertions.
const SY_START_KEY = '2026-09-01'

const ALL_SIX = [
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

describe('computeSchoolYearPlan', () => {
  it('projects 4 modules anchored to the slowest weekday with no holidays', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(),
    })

    expect(plan.modules).toHaveLength(4)
    expect(toDateKey(plan.modules[0].startDate)).toBe('2026-09-01')
    expect(toDateKey(plan.modules[0].endDate)).toBe('2026-10-19') // Mon
    expect(toDateKey(plan.modules[1].startDate)).toBe('2026-10-20')
    expect(toDateKey(plan.modules[1].endDate)).toBe('2026-12-07') // Mon
    expect(toDateKey(plan.modules[2].startDate)).toBe('2026-12-08')
    expect(toDateKey(plan.modules[2].endDate)).toBe('2027-01-25') // Mon
    expect(toDateKey(plan.modules[3].startDate)).toBe('2027-01-26')
    expect(toDateKey(plan.modules[3].endDate)).toBe('2027-03-15') // Mon
  })

  it('Module N+1.startDate is exactly 1 day after Module N.endDate', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(),
    })
    for (let i = 1; i < plan.modules.length; i++) {
      const expected = new Date(plan.modules[i - 1].endDate.getTime() + 86_400_000)
      expect(plan.modules[i].startDate.getTime()).toBe(expected.getTime())
    }
  })

  it('every active weekday gets exactly 7 sessions per module (28 total)', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(),
    })

    for (const w of ALL_SIX) {
      const keys = plan.sessionDatesByWeekday[w]
      expect(keys).toHaveLength(28)
      // 7 sessions inside each module's window.
      for (const m of plan.modules) {
        const startKey = toDateKey(m.startDate)
        const endKey = toDateKey(m.endDate)
        const inWindow = keys.filter((k) => k >= startKey && k <= endKey)
        expect(inWindow).toHaveLength(7)
      }
    }
  })

  it('lastSessionDateByWeekday is the 28th key per weekday', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(),
    })
    expect(plan.lastSessionDateByWeekday['Ponedjeljak']).toBe('2027-03-15')
    expect(plan.lastSessionDateByWeekday['Subota']).toBe(
      plan.sessionDatesByWeekday['Subota'].at(-1) ?? null,
    )
  })

  it('extends Module 2 endDate when the boundary Monday is a holiday', () => {
    // Baseline puts Module 2 endDate on Mon Dec 7 (Monday's 7th in Module 2).
    // Mark Dec 7 a holiday → 7th Monday slides to Dec 14, dragging the module
    // boundary with it. Monday still gets exactly 7; faster weekdays (Tue ..
    // Sat) get a "bonus" 8th session inside the now-longer window — the
    // algorithm guarantees ≥7 per weekday per module, never <7.
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(['2026-12-07']),
    })
    expect(toDateKey(plan.modules[1].endDate)).toBe('2026-12-14')

    const startKey = toDateKey(plan.modules[1].startDate)
    const endKey = toDateKey(plan.modules[1].endDate)
    for (const w of ALL_SIX) {
      const inWindow = plan.sessionDatesByWeekday[w].filter(
        (k) => k >= startKey && k <= endKey,
      )
      expect(inWindow.length).toBeGreaterThanOrEqual(7)
    }
    // Slowest weekday (the one anchoring the boundary) hits exactly 7.
    const monInWindow = plan.sessionDatesByWeekday['Ponedjeljak'].filter(
      (k) => k >= startKey && k <= endKey,
    )
    expect(monInWindow).toHaveLength(7)
  })

  it('handles a single active weekday', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ['Ponedjeljak'],
      holidayDates: new Set(),
    })
    expect(toDateKey(plan.modules[0].endDate)).toBe('2026-10-19')
    expect(plan.sessionDatesByWeekday['Ponedjeljak']).toHaveLength(28)
    expect(plan.sessionDatesByWeekday['Utorak']).toEqual([])
    expect(plan.lastSessionDateByWeekday['Utorak']).toBeNull()
  })

  it('boundary respects whichever active weekday hits its 7th later', () => {
    // Mon 7th = Oct 19, Fri 7th = Oct 16. Max = Oct 19.
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: ['Ponedjeljak', 'Petak'],
      holidayDates: new Set(),
    })
    expect(toDateKey(plan.modules[0].endDate)).toBe('2026-10-19')
  })

  it('returns a stub plan when no active weekdays are provided', () => {
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey(SY_START_KEY),
      activeWeekdays: [],
      holidayDates: new Set(),
    })
    expect(plan.modules).toHaveLength(4)
    for (const m of plan.modules) {
      expect(toDateKey(m.startDate)).toBe(SY_START_KEY)
      expect(toDateKey(m.endDate)).toBe(SY_START_KEY)
    }
    for (const w of ALL_SIX) {
      expect(plan.sessionDatesByWeekday[w]).toEqual([])
      expect(plan.lastSessionDateByWeekday[w]).toBeNull()
    }
  })
})

describe('deriveSessionDatesFromWindows', () => {
  it('caps the per-weekday list at 28 even when the window would generate more', () => {
    const result = deriveSessionDatesFromWindows({
      moduleWindows: [
        { startDate: fromDateKey('2026-09-07'), endDate: fromDateKey('2027-06-30') },
      ],
      holidayDates: new Set(),
    })
    expect(result.sessionDatesByWeekday['Ponedjeljak']).toHaveLength(28)
    expect(result.lastSessionDateByWeekday['Ponedjeljak']).not.toBeNull()
  })

  it('derives sessions for every weekday Pon–Sub from the same windows', () => {
    // No activeWeekdays filter — the calendar is a projection of the schedule,
    // independent of which weekdays have ScheduledGroups.
    const result = deriveSessionDatesFromWindows({
      moduleWindows: [
        { startDate: fromDateKey('2026-09-01'), endDate: fromDateKey('2026-09-30') },
      ],
      holidayDates: new Set(),
    })
    for (const w of ALL_SIX) {
      expect(result.sessionDatesByWeekday[w].length).toBeGreaterThan(0)
    }
  })

  it('lastSessionDateByWeekday is null when fewer than 28 sessions would be generated', () => {
    const result = deriveSessionDatesFromWindows({
      moduleWindows: [
        { startDate: fromDateKey('2027-01-04'), endDate: fromDateKey('2027-01-25') },
      ],
      holidayDates: new Set(),
    })
    expect(result.sessionDatesByWeekday['Ponedjeljak']).toEqual([
      '2027-01-04',
      '2027-01-11',
      '2027-01-18',
      '2027-01-25',
    ])
    expect(result.lastSessionDateByWeekday['Ponedjeljak']).toBeNull()
  })

  it('drops holiday keys from the session list', () => {
    const result = deriveSessionDatesFromWindows({
      moduleWindows: [
        { startDate: fromDateKey('2027-01-04'), endDate: fromDateKey('2027-01-25') },
      ],
      holidayDates: new Set(['2027-01-11']),
    })
    expect(result.sessionDatesByWeekday['Ponedjeljak']).toEqual([
      '2027-01-04',
      '2027-01-18',
      '2027-01-25',
    ])
  })
})

describe('computeModuleMarkers', () => {
  it('places markers at the first and last session of every weekday Pon–Sub', () => {
    // No activeWeekdays input — markers cover every weekday in the window,
    // regardless of which weekdays have ScheduledGroups.
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: [
            {
              sortOrder: 0,
              title: 'Modul 1',
              startDate: fromDateKey('2026-09-01'),
              endDate: fromDateKey('2026-10-19'),
            },
          ],
        },
      ],
      holidayDates: new Set(),
    })

    // First Tuesday Sept 1 + last Tuesday Oct 13 (Oct 20 > 19).
    expect(markers.some((m) => m.date === '2026-09-01' && m.kind === 'start')).toBe(true)
    expect(markers.some((m) => m.date === '2026-10-13' && m.kind === 'end')).toBe(true)
    // First Monday Sept 7 + last Monday Oct 19.
    expect(markers.some((m) => m.date === '2026-09-07' && m.kind === 'start')).toBe(true)
    expect(markers.some((m) => m.date === '2026-10-19' && m.kind === 'end')).toBe(true)
    // First Saturday Sept 5 + last Saturday Oct 17.
    expect(markers.some((m) => m.date === '2026-09-05' && m.kind === 'start')).toBe(true)
    expect(markers.some((m) => m.date === '2026-10-17' && m.kind === 'end')).toBe(true)
    // 6 weekdays × 2 (start+end) = 12 markers from one course/one module.
    expect(markers).toHaveLength(12)
  })

  it('dedupes identical (date, kind, moduleIndex, label) markers across courses', () => {
    const sharedModule = {
      sortOrder: 0,
      title: 'Modul 1',
      startDate: fromDateKey('2026-09-01'),
      endDate: fromDateKey('2026-10-19'),
    }
    const markers = computeModuleMarkers({
      courses: [
        { courseId: 'c1', courseLabel: 'SLR 1', modules: [sharedModule] },
        { courseId: 'c2', courseLabel: 'SLR 2', modules: [sharedModule] },
      ],
      holidayDates: new Set(),
    })

    const monStart = markers.filter((m) => m.date === '2026-09-07' && m.kind === 'start')
    expect(monStart).toHaveLength(1)
    expect(monStart[0].tooltip).toContain('SLR 1')
    expect(monStart[0].tooltip).toContain('SLR 2')
    expect(monStart[0].tooltip).toContain('Pon')
    expect(monStart[0].tooltip).toContain('početak')
  })

  it('shifts the boundary marker when a session lands on a holiday', () => {
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: [
            {
              sortOrder: 0,
              title: 'Modul 1',
              startDate: fromDateKey('2026-09-01'),
              endDate: fromDateKey('2026-09-21'),
            },
          ],
        },
      ],
      holidayDates: new Set(['2026-09-07']),
    })

    const monStart = markers.find((m) => m.kind === 'start' && m.tooltip.includes('Pon'))
    expect(monStart?.date).toBe('2026-09-14')
  })

  it('moduleIndex is the array position + 1 regardless of sortOrder convention', () => {
    // Seed uses sortOrder = 1, 2, 3, 4; older data may use 0, 1, 2, 3.
    // Marker rendering ("M1", "M2", …) must be position-based.
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: [
            {
              sortOrder: 1,
              title: 'Modul 1',
              startDate: fromDateKey('2026-09-01'),
              endDate: fromDateKey('2026-10-19'),
            },
            {
              sortOrder: 2,
              title: 'Modul 2',
              startDate: fromDateKey('2026-10-20'),
              endDate: fromDateKey('2026-12-07'),
            },
          ],
        },
      ],
      holidayDates: new Set(),
    })
    const m1 = markers.find((m) => m.label === 'Modul 1')
    const m2 = markers.find((m) => m.label === 'Modul 2')
    expect(m1?.moduleIndex).toBe(1)
    expect(m2?.moduleIndex).toBe(2)
  })

  it('places per-weekday end markers at each weekday\'s 7th session, not the last occurrence inside the slowest-weekday window', () => {
    // Regression for the bug where Mon (2 holidays in M1) and Wed (no
    // holidays) both got M1-end markers in the same week — `computeExpectedSessions`
    // was returning the LAST weekday occurrence inside the slowest-weekday-
    // anchored window, which for fast weekdays is their 8th-or-9th, not 7th.
    //
    // Planner anchors Module 1 endDate on the slowest weekday's 7th. With 2
    // Mon holidays, Mon's 7th is later than Wed's 7th — markers must reflect
    // that, NOT cluster on the slowest weekday's date.
    const holidays = new Set(['2026-09-07', '2026-09-21'])
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey('2026-09-01'),
      activeWeekdays: ALL_SIX,
      holidayDates: holidays,
    })
    // Mon's 7th (anchor): 7 Mons from 01.09 skipping 07.09 and 21.09 = 14.09,
    // 28.09, 05.10, 12.10, 19.10, 26.10, 02.11.
    expect(toDateKey(plan.modules[0].endDate)).toBe('2026-11-02')
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: [
            {
              sortOrder: 0,
              title: 'Modul 1',
              startDate: plan.modules[0].startDate,
              endDate: plan.modules[0].endDate,
            },
          ],
        },
      ],
      holidayDates: holidays,
    })
    // Mon M1 end on 02.11; Wed M1 end on its own 7th = 02.09, 09.09, 16.09,
    // 23.09, 30.09, 07.10, 14.10 → 14.10. Different week from Mon.
    const monEnd = markers.find((m) => m.kind === 'end' && m.tooltip.includes('Pon'))
    const wedEnd = markers.find((m) => m.kind === 'end' && m.tooltip.includes('Sri'))
    expect(monEnd?.date).toBe('2026-11-02')
    expect(wedEnd?.date).toBe('2026-10-14')
    // Different ISO weeks — concretely separated by 2.5+ weeks.
    expect(
      fromDateKey(monEnd!.date).getTime() - fromDateKey(wedEnd!.date).getTime(),
    ).toBeGreaterThan(7 * 86_400_000)
  })

  it('places M2 start markers per-weekday on the race-ahead next session, not at ModuleSchedule.startDate', () => {
    // Wed finishes M1 a week earlier than the slowest weekday — its M2 start
    // marker must land on the next Wed after its M1 7th (race-ahead), not on
    // the course-level ModuleSchedule[2].startDate which targets the slowest
    // weekday.
    const plan = computeSchoolYearPlan({
      startDate: fromDateKey('2026-09-01'),
      activeWeekdays: ALL_SIX,
      holidayDates: new Set(),
    })
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: plan.modules.map((m, i) => ({
            sortOrder: i,
            title: `Modul ${i + 1}`,
            startDate: m.startDate,
            endDate: m.endDate,
          })),
        },
      ],
      holidayDates: new Set(),
    })
    // Wed M1 7th = 14.10. Wed M2 1st (race-ahead) = 21.10.
    // ModuleSchedule[2].startDate = 20.10 (Mon). Marker must be at 21.10, NOT 20.10.
    const wedM2Start = markers.find(
      (m) => m.kind === 'start' && m.label === 'Modul 2' && m.tooltip.includes('Sri'),
    )
    expect(wedM2Start?.date).toBe('2026-10-21')
  })

  it('omits modules without a startDate or endDate', () => {
    const markers = computeModuleMarkers({
      courses: [
        {
          courseId: 'c1',
          courseLabel: 'SLR 1',
          modules: [
            { sortOrder: 0, title: 'Modul 1', startDate: null, endDate: null },
            {
              sortOrder: 1,
              title: 'Modul 2',
              startDate: fromDateKey('2026-09-01'),
              endDate: fromDateKey('2026-10-19'),
            },
          ],
        },
      ],
      holidayDates: new Set(),
    })

    expect(markers.every((m) => m.label === 'Modul 2')).toBe(true)
  })
})
