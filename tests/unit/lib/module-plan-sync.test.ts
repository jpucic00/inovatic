import { describe, expect, it } from 'vitest'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import { rederivedModuleWindows } from '@/lib/module-plan-sync'
import { deriveSessionDatesFromWindows } from '@/lib/school-year-planner'

// Tue 1 Sept 2026; Monday is the slowest weekday, its 7th session is 19 Oct.
const KICKOFF = fromDateKey('2026-09-01')
const MONDAY_IN_MODULE_1 = '2026-10-12'

const keys = (windows: { startDate: Date; endDate: Date }[]) =>
  windows.map((w) => [toDateKey(w.startDate), toDateKey(w.endDate)])

describe('rederivedModuleWindows', () => {
  it('lays four windows off module 1 start, ignoring the stored later starts', () => {
    const windows = rederivedModuleWindows({
      moduleStartDates: [KICKOFF, fromDateKey('2030-01-01'), null, null],
      holidayDates: new Set(),
    })
    expect(windows).not.toBeNull()
    expect(keys(windows!)[0]).toEqual(['2026-09-01', '2026-10-19'])
    expect(toDateKey(windows![1].startDate)).toBe('2026-10-20')
  })

  it('pushes every later module when a holiday lands in module 1', () => {
    const before = rederivedModuleWindows({
      moduleStartDates: [KICKOFF, null, null, null],
      holidayDates: new Set(),
    })!
    const after = rederivedModuleWindows({
      moduleStartDates: [KICKOFF, null, null, null],
      holidayDates: new Set([MONDAY_IN_MODULE_1]),
    })!
    expect(toDateKey(after[0].startDate)).toBe('2026-09-01')
    expect(toDateKey(after[0].endDate)).toBe('2026-10-26')
    for (const i of [1, 2, 3]) {
      expect(after[i].startDate.getTime()).toBeGreaterThan(before[i].startDate.getTime())
    }
  })

  it('keeps every weekday on 28 sessions inside the windows it derives', () => {
    const holidayDates = new Set([MONDAY_IN_MODULE_1, '2026-12-24', '2026-12-25'])
    const windows = rederivedModuleWindows({
      moduleStartDates: [KICKOFF, null, null, null],
      holidayDates,
    })!
    const { sessionDatesByWeekday } = deriveSessionDatesFromWindows({
      moduleWindows: windows,
      holidayDates,
    })
    for (const dates of Object.values(sessionDatesByWeekday)) expect(dates).toHaveLength(28)
  })

  it('returns null for a year without a module-1 start', () => {
    expect(
      rederivedModuleWindows({ moduleStartDates: [null, null, null, null], holidayDates: new Set() }),
    ).toBeNull()
  })

  it('returns null for a course that is not exactly four modules', () => {
    expect(
      rederivedModuleWindows({ moduleStartDates: [KICKOFF, null, null], holidayDates: new Set() }),
    ).toBeNull()
  })
})
