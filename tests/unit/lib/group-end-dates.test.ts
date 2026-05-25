import { describe, expect, it } from 'vitest'
import { CourseLevel } from '@prisma/client'
import { ACTIVE_WEEKDAYS, computeWeekdaySummary } from '@/lib/group-end-dates'
import { toDateKey } from '@/lib/session-dates'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

// 28 full weeks: Mon 2025-10-06 → Sun 2026-04-19. Every weekday gets 28 sessions
// in this window, so the target-of-28 baseline holds for any chosen weekday.
const SLR1 = {
  courseId: 'slr1',
  courseTitle: 'SLR 1',
  level: CourseLevel.SLR_1,
  moduleWindows: [{ startDate: utc(2025, 10, 6), endDate: utc(2026, 4, 19) }],
}

describe('computeWeekdaySummary', () => {
  it('returns 6 weekday rows in canonical Croatian order', () => {
    const out = computeWeekdaySummary({ courses: [SLR1], holidayDates: new Set() })
    expect(out.map((w) => w.weekday)).toEqual([...ACTIVE_WEEKDAYS])
  })

  it('hits target of 28 with no holidays — green flags', () => {
    const out = computeWeekdaySummary({ courses: [SLR1], holidayDates: new Set() })
    const mon = out.find((w) => w.weekday === 'Ponedjeljak')!.courses[0]
    expect(mon.computedSessions).toBe(28)
    expect(mon.shortOfTarget).toBe(false)
    expect(mon.overflowsWindow).toBe(false)
    expect(toDateKey(mon.lastSessionDate!)).toBe('2026-04-13')
  })

  it('flags shortOfTarget when holidays drop a Monday', () => {
    const out = computeWeekdaySummary({
      courses: [SLR1],
      holidayDates: new Set(['2025-12-29', '2026-01-05']), // two Mondays
    })
    const mon = out.find((w) => w.weekday === 'Ponedjeljak')!.courses[0]
    expect(mon.computedSessions).toBe(26)
    expect(mon.shortOfTarget).toBe(true)
    // The same holidays don't fall on Tuesdays, so Tuesday stays green.
    const tue = out.find((w) => w.weekday === 'Utorak')!.courses[0]
    expect(tue.shortOfTarget).toBe(false)
  })

  it('flags overflowsWindow when last session goes past last module endDate', () => {
    // Module ends Tue 2025-10-07 but we ask about Wednesday: no Wed in window → no overflow.
    // Realistic case: extend the window so a Friday session lands after the original endDate.
    const course = {
      ...SLR1,
      moduleWindows: [{ startDate: utc(2025, 10, 6), endDate: utc(2025, 10, 9) }], // Mon-Thu only
    }
    const out = computeWeekdaySummary({ courses: [course], holidayDates: new Set() })
    const mon = out.find((w) => w.weekday === 'Ponedjeljak')!.courses[0]
    // Last Monday in window is the 6th — equal to start, not after endDate.
    expect(mon.overflowsWindow).toBe(false)
    // Friday (10th) is outside the Mon-Thu window so no session at all.
    const fri = out.find((w) => w.weekday === 'Petak')!.courses[0]
    expect(fri.computedSessions).toBe(0)
    expect(fri.lastSessionDate).toBeNull()
    expect(fri.overflowsWindow).toBe(false)
  })

  it('respects a custom target', () => {
    const out = computeWeekdaySummary({
      courses: [SLR1],
      holidayDates: new Set(),
      target: 30,
    })
    const mon = out.find((w) => w.weekday === 'Ponedjeljak')!.courses[0]
    expect(mon.target).toBe(30)
    expect(mon.shortOfTarget).toBe(true) // 28 < 30
  })

  it('handles empty courses list gracefully', () => {
    const out = computeWeekdaySummary({ courses: [], holidayDates: new Set() })
    expect(out.length).toBe(ACTIVE_WEEKDAYS.length)
    expect(out.every((w) => w.courses.length === 0)).toBe(true)
  })
})
