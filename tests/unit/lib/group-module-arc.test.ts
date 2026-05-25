import { describe, expect, it } from 'vitest'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
  type GroupModuleArcEntry,
} from '@/lib/group-module-arc'
import { toDateKey } from '@/lib/session-dates'

/**
 * Helper: build a module input shape matching what callers pass.
 * `start`/`end` are YYYY-MM-DD strings (UTC-midnight via Date.UTC).
 */
function buildModule(
  id: string,
  sortOrder: number,
  scheduleId: string | null,
  start: string | null,
  end: string | null,
) {
  return {
    id,
    title: `Modul ${sortOrder}`,
    sortOrder,
    schedule:
      scheduleId === null
        ? null
        : {
            id: scheduleId,
            startDate: start ? new Date(`${start}T00:00:00.000Z`) : null,
            endDate: end ? new Date(`${end}T00:00:00.000Z`) : null,
          },
  }
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

/**
 * The school-year planner's slowest-weekday boundary math, mirrored at the
 * window level (Module N+1 startDate = Module N endDate + 1 day, where
 * Module N endDate = slowest weekday's 7th session). For these tests we hand-
 * pick windows that match the planner's output for a 2025/2026-style kickoff.
 */
const STD_MODULES = [
  buildModule('mod-1', 1, 'sch-1', '2025-09-15', '2025-10-27'),
  buildModule('mod-2', 2, 'sch-2', '2025-10-28', '2025-12-15'),
  buildModule('mod-3', 3, 'sch-3', '2025-12-16', '2026-02-09'),
  buildModule('mod-4', 4, 'sch-4', '2026-02-10', '2026-03-30'),
]

describe('getGroupModuleArc', () => {
  it('returns empty arc when dayOfWeek is null', () => {
    const arc = getGroupModuleArc({
      dayOfWeek: null,
      modules: STD_MODULES,
      holidayDates: new Set(),
    })
    expect(arc).toEqual([])
  })

  it('returns empty arc when modules array is empty', () => {
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: [],
      holidayDates: new Set(),
    })
    expect(arc).toEqual([])
  })

  it('produces 4 entries of 7 sessions each for a clean Wed group (no holidays)', () => {
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      holidayDates: new Set(),
    })
    expect(arc).toHaveLength(4)
    for (const entry of arc) {
      expect(entry.sessionDates).toHaveLength(7)
      // Every date is a Wednesday (UTC day === 3).
      for (const d of entry.sessionDates) {
        expect(d.getUTCDay()).toBe(3)
      }
      expect(entry.firstSession).toEqual(entry.sessionDates[0])
      expect(entry.lastSession).toEqual(entry.sessionDates[6])
    }
    // Wed Module 1 first session = first Wed on/after 2025-09-15 (Mon) = 17.09.
    expect(toDateKey(arc[0].firstSession)).toBe('2025-09-17')
    // Wed Module 1 last session = 7th Wed counting from 17.09 = 29.10.
    expect(toDateKey(arc[0].lastSession)).toBe('2025-10-29')
    // Race-ahead: Module 2 first session is the next Wed after 29.10 = 05.11,
    // NOT 29.10 → which would be inside Module 1's window again.
    expect(toDateKey(arc[1].firstSession)).toBe('2025-11-05')
  })

  it('race-ahead: Mon (2 holidays in M1) and Wed (0 holidays) diverge by mid-Module 1', () => {
    // Two holidays land on Mondays inside Module 1 — 22.09 and 06.10.
    const holidays = new Set(['2025-09-22', '2025-10-06'])
    const wed = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      holidayDates: holidays,
    })
    const mon = getGroupModuleArc({
      dayOfWeek: 'Ponedjeljak',
      modules: STD_MODULES,
      holidayDates: holidays,
    })
    expect(wed).toHaveLength(4)
    expect(mon).toHaveLength(4)
    // Wed finishes Module 1 unaffected by Mon holidays.
    expect(toDateKey(wed[0].lastSession)).toBe('2025-10-29')
    // Mon finishes Module 1 two weeks later because of 2 skipped Mondays.
    // Mon sessions inside M1: 15.09, 29.09 (skipping 22.09), 13.10 (skipping
    // 06.10), 20.10, 27.10, 03.11, 10.11 → lastSession 10.11.
    expect(toDateKey(mon[0].lastSession)).toBe('2025-11-10')
  })

  it('race-ahead: Module N+1 firstSession is next weekday occurrence after Module N lastSession + 1 day', () => {
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      holidayDates: new Set(),
    })
    for (let i = 1; i < arc.length; i++) {
      const prevPlus1 = arc[i - 1].lastSession.getTime() + 86_400_000
      expect(arc[i].firstSession.getTime()).toBeGreaterThanOrEqual(prevPlus1)
      // The gap is at most 7 days because we only skip non-weekday days plus
      // any holidays on that weekday.
      expect(arc[i].firstSession.getTime() - prevPlus1).toBeLessThanOrEqual(
        6 * 86_400_000,
      )
    }
  })

  it('returns partial arc when later modules lack schedules', () => {
    const partial = [
      STD_MODULES[0],
      STD_MODULES[1],
      buildModule('mod-3', 3, null, null, null),
      buildModule('mod-4', 4, null, null, null),
    ]
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: partial,
      holidayDates: new Set(),
    })
    expect(arc).toHaveLength(2)
    expect(arc[0].moduleIndex).toBe(1)
    expect(arc[1].moduleIndex).toBe(2)
  })

  it('skips holidays on the target weekday and walks forward to find 7 sessions', () => {
    // Single 4-module course; put 3 Wed holidays inside Module 1's window.
    const holidays = new Set(['2025-09-24', '2025-10-01', '2025-10-08'])
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      holidayDates: holidays,
    })
    expect(arc).toHaveLength(4)
    // Wed sessions in M1 after skipping 3 holidays: 17.09, [skip 24.09],
    // [skip 01.10], [skip 08.10], 15.10, 22.10, 29.10, 05.11, 12.11.
    expect(toDateKey(arc[0].firstSession)).toBe('2025-09-17')
    expect(toDateKey(arc[0].lastSession)).toBe('2025-11-19')
    for (const d of arc[0].sessionDates) {
      expect(holidays.has(toDateKey(d))).toBe(false)
    }
  })

  it('preserves sortOrder ordering even if the input is shuffled', () => {
    const shuffled = [STD_MODULES[2], STD_MODULES[0], STD_MODULES[3], STD_MODULES[1]]
    const arc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: shuffled,
      holidayDates: new Set(),
    })
    expect(arc.map((e) => e.moduleIndex)).toEqual([1, 2, 3, 4])
    expect(arc.map((e) => e.moduleId)).toEqual(['mod-1', 'mod-2', 'mod-3', 'mod-4'])
  })
})

describe('getActiveModuleForGroup', () => {
  const arc: GroupModuleArcEntry[] = getGroupModuleArc({
    dayOfWeek: 'Srijeda',
    modules: STD_MODULES,
    holidayDates: new Set(),
  })

  it('returns state "pre" with all nulls when asOfDate is before the arc starts', () => {
    const state = getActiveModuleForGroup(arc, utc('2025-09-01'))
    expect(state.state).toBe('pre')
    expect(state.inProgressModule).toBeNull()
    expect(state.nextEnrollingModule).toBe(arc[0])
    expect(state.lastCompletedModule).toBeNull()
    expect(state.completedModules).toEqual([])
  })

  it('returns state "in" with inProgressModule when asOfDate lies inside a module', () => {
    // Mid-Module-2 for Wed: arc[1].firstSession = 05.11, arc[1].lastSession = 17.12.
    const state = getActiveModuleForGroup(arc, utc('2025-11-12'))
    expect(state.state).toBe('in')
    expect(state.inProgressModule).toBe(arc[1])
    // Next enrolling is Module 3 — a student joining today doesn't slot into
    // the in-progress Module 2.
    expect(state.nextEnrollingModule).toBe(arc[2])
    expect(state.lastCompletedModule).toBe(arc[0])
    expect(state.completedModules).toEqual([arc[0]])
  })

  it('returns state "between" when asOfDate is between modules', () => {
    // arc[0].lastSession = 29.10 (Wed). arc[1].firstSession = 05.11 (Wed).
    // 31.10 is between modules.
    const state = getActiveModuleForGroup(arc, utc('2025-10-31'))
    expect(state.state).toBe('between')
    expect(state.inProgressModule).toBeNull()
    expect(state.nextEnrollingModule).toBe(arc[1])
    expect(state.lastCompletedModule).toBe(arc[0])
  })

  it('returns state "done" when asOfDate is past the last module session', () => {
    const lastSession = arc[arc.length - 1].lastSession
    const past = new Date(lastSession.getTime() + 30 * 86_400_000)
    const state = getActiveModuleForGroup(arc, past)
    expect(state.state).toBe('done')
    expect(state.inProgressModule).toBeNull()
    expect(state.nextEnrollingModule).toBeNull()
    expect(state.lastCompletedModule).toBe(arc[arc.length - 1])
    expect(state.completedModules).toHaveLength(arc.length)
  })

  it('returns state "pre" with all nulls on an empty arc', () => {
    const state = getActiveModuleForGroup([], utc('2026-01-01'))
    expect(state.state).toBe('pre')
    expect(state.inProgressModule).toBeNull()
    expect(state.nextEnrollingModule).toBeNull()
    expect(state.lastCompletedModule).toBeNull()
    expect(state.completedModules).toEqual([])
  })

  it('nextEnrollingModule is always strictly after asOfDate', () => {
    for (let i = 0; i < arc.length; i++) {
      const firstSession = arc[i].firstSession
      const oneDayBefore = new Date(firstSession.getTime() - 86_400_000)
      const state = getActiveModuleForGroup(arc, oneDayBefore)
      expect(state.nextEnrollingModule).toBe(arc[i])
    }
  })

  it('mid-Module-1 for Wed (no holidays) vs Mon (2 holidays) gives different inProgress modules on the same date', () => {
    const holidays = new Set(['2025-09-22', '2025-10-06'])
    const wedArc = getGroupModuleArc({
      dayOfWeek: 'Srijeda',
      modules: STD_MODULES,
      holidayDates: holidays,
    })
    const monArc = getGroupModuleArc({
      dayOfWeek: 'Ponedjeljak',
      modules: STD_MODULES,
      holidayDates: holidays,
    })
    // Pick a date where Wed has finished Module 1 (last 29.10) and is in M2,
    // but Mon hasn't finished Module 1 yet (last 10.11).
    const asOf = utc('2025-11-05')
    const wedState = getActiveModuleForGroup(wedArc, asOf)
    const monState = getActiveModuleForGroup(monArc, asOf)
    expect(wedState.state).toBe('in')
    expect(wedState.inProgressModule?.moduleIndex).toBe(2)
    expect(monState.state).toBe('in')
    expect(monState.inProgressModule?.moduleIndex).toBe(1)
  })
})
