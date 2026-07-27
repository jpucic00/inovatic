import { describe, expect, it } from 'vitest'
import {
  isTeacherMarkableDate,
  teacherMarkingError,
  teacherMarkingWindow,
  zagrebDateKey,
} from '@/lib/attendance-window'

// Mid-month, midday UTC — safely inside the same Zagreb calendar day.
const MID_JULY = new Date('2026-07-15T12:00:00Z')

describe('zagrebDateKey', () => {
  it('formats the Europe/Zagreb calendar date', () => {
    expect(zagrebDateKey(MID_JULY)).toBe('2026-07-15')
  })

  // Zagreb is UTC+2 in July, so 22:30 UTC is already the next day locally.
  it('rolls to the next day once Zagreb has passed midnight', () => {
    expect(zagrebDateKey(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
  })

  // ...and 23:30 UTC on the 31st is the 1st in Zagreb — the boundary that would
  // silently shift the whole marking window if this were computed in UTC.
  it('rolls the month over on the Zagreb boundary, not the UTC one', () => {
    expect(zagrebDateKey(new Date('2026-07-31T23:30:00Z'))).toBe('2026-08-01')
  })
})

describe('teacherMarkingWindow', () => {
  it('spans the 1st of the Zagreb month through today', () => {
    expect(teacherMarkingWindow(MID_JULY)).toEqual({
      firstOfMonth: '2026-07-01',
      today: '2026-07-15',
    })
  })

  it('is a single day on the 1st', () => {
    expect(teacherMarkingWindow(new Date('2026-07-01T12:00:00Z'))).toEqual({
      firstOfMonth: '2026-07-01',
      today: '2026-07-01',
    })
  })
})

describe('isTeacherMarkableDate', () => {
  it.each([
    ['2026-07-15', true, 'today'],
    ['2026-07-14', true, 'yesterday'],
    ['2026-07-01', true, 'the 1st of this month'],
    ['2026-07-16', false, 'tomorrow'],
    ['2026-07-31', false, 'later this month'],
    ['2026-06-30', false, 'the last day of last month'],
    ['2026-06-01', false, 'last month'],
    ['2026-08-01', false, 'next month'],
  ])('%s → %s (%s)', (date, expected) => {
    expect(isTeacherMarkableDate(date, MID_JULY)).toBe(expected)
  })
})

describe('teacherMarkingError', () => {
  it('returns null inside the window', () => {
    expect(teacherMarkingError('2026-07-15', MID_JULY)).toBeNull()
  })

  it('names the future case', () => {
    expect(teacherMarkingError('2026-07-16', MID_JULY)).toMatch(/budući termin/)
  })

  it('points a past-month date at the administrator', () => {
    expect(teacherMarkingError('2026-06-30', MID_JULY)).toMatch(/tekućeg mjeseca/)
  })

  // The two branches must not collide: a past-month date is never reported as
  // "in the future" just because it sorts below the window start.
  it('distinguishes the two rejections', () => {
    const future = teacherMarkingError('2026-09-01', MID_JULY)
    const past = teacherMarkingError('2026-05-01', MID_JULY)
    expect(future).not.toBe(past)
  })
})
