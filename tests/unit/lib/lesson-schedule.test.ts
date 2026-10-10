import { describe, expect, it } from 'vitest'
import {
  LESSON_SESSION_NUMBERS,
  PROBNI_SAT_SESSION,
  formatLessonSessions,
  placeLessons,
} from '@/lib/lesson-schedule'

const d = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day))

/** A module's seven sats on a Monday group: 5.10., 12.10., … 16.11. */
const SESSION_DATES = [d(10, 5), d(10, 12), d(10, 19), d(10, 26), d(11, 2), d(11, 9), d(11, 16)]
const TRIAL = d(9, 28)

function lesson(
  id: string,
  sessionNumbers: number[],
  sortOrder = 0,
  createdAt: Date = d(1, 1),
) {
  return { id, sessionNumbers, sortOrder, createdAt, title: `Lekcija ${id}` }
}

const ids = (placement: { lessons: { id: string }[] }) => placement.lessons.map((l) => l.id)

describe('constants', () => {
  it('the probni sat is sat 0 and a module holds sats 1–7', () => {
    expect(PROBNI_SAT_SESSION).toBe(0)
    expect([...LESSON_SESSION_NUMBERS]).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('placeLessons — display order', () => {
  it('orders by first sat, probni sat first, undated lessons last', () => {
    const placement = placeLessons({
      lessons: [lesson('undated', []), lesson('c', [5, 6]), lesson('trial', [0]), lesson('a', [1, 2]), lesson('b', [3])],
      sessionDates: SESSION_DATES,
      trialDate: TRIAL,
      today: d(10, 1),
    })
    expect(ids(placement)).toEqual(['trial', 'a', 'b', 'c', 'undated'])
  })

  it('orders by the LOWEST sat even when the lesson lists its sats unsorted', () => {
    const placement = placeLessons({
      lessons: [lesson('late', [7, 2]), lesson('early', [4, 1])],
      sessionDates: SESSION_DATES,
      trialDate: null,
      today: d(10, 1),
    })
    expect(ids(placement)).toEqual(['early', 'late'])
    expect(placement.lessons[1].sessionNumbers).toEqual([2, 7])
  })

  it('does not depend on input order', () => {
    const lessons = [
      lesson('u2', [], 2),
      lesson('s3', [3]),
      lesson('u1', [], 1),
      lesson('s1', [1]),
      lesson('t', [0]),
    ]
    const expected = ['t', 's1', 's3', 'u1', 'u2']
    for (const order of [lessons, [...lessons].reverse(), [lessons[2], lessons[4], lessons[0], lessons[3], lessons[1]]]) {
      const placement = placeLessons({ lessons: order, sessionDates: SESSION_DATES, trialDate: TRIAL, today: d(10, 1) })
      expect(ids(placement)).toEqual(expected)
      const undated = placeLessons({ lessons: order, sessionDates: null, trialDate: null, today: d(10, 1) })
      expect(ids(undated)).toEqual(expected)
    }
  })

  it('breaks ties among undated lessons by sortOrder, then createdAt', () => {
    const placement = placeLessons({
      lessons: [
        lesson('newer', [], 1, d(3, 1)),
        lesson('second', [], 2, d(1, 1)),
        lesson('older', [], 1, d(2, 1)),
        lesson('first', [], 0, d(9, 1)),
      ],
      sessionDates: null,
      trialDate: null,
      today: d(10, 1),
    })
    expect(ids(placement)).toEqual(['first', 'older', 'newer', 'second'])
  })

  it('does not mutate the input lessons and keeps extra fields', () => {
    const input = lesson('a', [3, 1])
    const placement = placeLessons({ lessons: [input], sessionDates: SESSION_DATES, trialDate: null, today: d(10, 1) })
    expect(input.sessionNumbers).toEqual([3, 1])
    expect(placement.lessons[0].title).toBe('Lekcija a')
    expect(placement.lessons[0].sessionNumbers).toEqual([1, 3])
  })
})

describe('placeLessons — firstDate', () => {
  it('is the date of the lesson\'s first sat on the group\'s arc', () => {
    const placement = placeLessons({
      lessons: [lesson('a', [1, 2]), lesson('b', [6, 4])],
      sessionDates: SESSION_DATES,
      trialDate: null,
      today: d(10, 1),
    })
    expect(placement.lessons.map((l) => l.firstDate)).toEqual([d(10, 5), d(10, 26)])
  })

  it('is the trial date for a probni sat lesson when a trial date is known', () => {
    const placement = placeLessons({
      lessons: [lesson('t', [0, 1])],
      sessionDates: SESSION_DATES,
      trialDate: TRIAL,
      today: d(10, 1),
    })
    expect(placement.lessons[0].firstDate).toEqual(TRIAL)
  })

  it('skips an unplaced probni sat and falls to the next sat', () => {
    const placement = placeLessons({
      lessons: [lesson('t', [0, 1]), lesson('only-trial', [0])],
      sessionDates: SESSION_DATES,
      trialDate: null,
      today: d(10, 1),
    })
    const byId = Object.fromEntries(placement.lessons.map((l) => [l.id, l.firstDate]))
    expect(byId.t).toEqual(d(10, 5))
    expect(byId['only-trial']).toBeNull()
  })

  it('is null for every lesson in undated mode', () => {
    const placement = placeLessons({
      lessons: [lesson('a', [1]), lesson('t', [0]), lesson('u', [])],
      sessionDates: null,
      trialDate: TRIAL,
      today: d(10, 1),
    })
    expect(placement.lessons.every((l) => l.firstDate === null)).toBe(true)
  })

  it('is null for a sat the arc does not reach', () => {
    const placement = placeLessons({
      lessons: [lesson('a', [7])],
      sessionDates: SESSION_DATES.slice(0, 5),
      trialDate: null,
      today: d(12, 1),
    })
    expect(placement.lessons[0].firstDate).toBeNull()
    expect(placement.currentLessonId).toBeNull()
  })
})

describe('placeLessons — current lesson (dated)', () => {
  const lessons = [lesson('a', [1, 2]), lesson('b', [3]), lesson('c', [5, 6, 7])]
  const at = (today: Date, input = lessons, trialDate: Date | null = null) =>
    placeLessons({ lessons: input, sessionDates: SESSION_DATES, trialDate, today }).currentLessonId

  it('has nothing current before the first lesson starts', () => {
    expect(at(d(10, 4))).toBeNull()
    expect(at(d(9, 1))).toBeNull()
  })

  it('makes a lesson current ON the day of its first sat', () => {
    expect(at(d(10, 5))).toBe('a')
    expect(at(d(10, 19))).toBe('b')
  })

  it('keeps a lesson current through its own later sats and until the next lesson starts', () => {
    expect(at(d(10, 12))).toBe('a')
    expect(at(d(10, 18))).toBe('a')
  })

  it('keeps the previous lesson current across a sat no lesson holds', () => {
    // Sat 4 (26.10.) has no lesson; b stays current until c starts on sat 5.
    expect(at(d(10, 26))).toBe('b')
    expect(at(d(11, 1))).toBe('b')
    expect(at(d(11, 2))).toBe('c')
  })

  it('keeps the last lesson current after the module ends', () => {
    expect(at(d(12, 20))).toBe('c')
  })

  it('uses the FIRST sat of a lesson spanning non-contiguous sats', () => {
    const split = [lesson('x', [2, 6]), lesson('y', [4])]
    expect(at(d(10, 5), split)).toBeNull()
    expect(at(d(10, 12), split)).toBe('x')
    // y takes over on sat 4, and x's sat 6 does NOT bring it back.
    expect(at(d(10, 26), split)).toBe('y')
    expect(at(d(11, 9), split)).toBe('y')
  })

  it('makes a probni sat lesson current on the trial date', () => {
    const withTrial = [lesson('t', [0]), ...lessons]
    expect(at(d(9, 27), withTrial, TRIAL)).toBeNull()
    expect(at(TRIAL, withTrial, TRIAL)).toBe('t')
    expect(at(d(10, 4), withTrial, TRIAL)).toBe('t')
    expect(at(d(10, 5), withTrial, TRIAL)).toBe('a')
  })

  it('never makes a probni sat lesson current without a trial date', () => {
    const withTrial = [lesson('t', [0]), ...lessons]
    expect(at(TRIAL, withTrial, null)).toBeNull()
    expect(at(d(10, 4), withTrial, null)).toBeNull()
    expect(at(d(10, 5), withTrial, null)).toBe('a')
  })

  it('never makes a lesson without sats current', () => {
    const withUndated = [lesson('u', [], -1), lesson('b', [3])]
    expect(at(d(10, 5), withUndated)).toBeNull()
    expect(at(d(12, 1), withUndated)).toBe('b')
    expect(at(d(12, 1), [lesson('u', [])])).toBeNull()
  })

  it('compares against the given today regardless of input order', () => {
    expect(at(d(10, 19), [...lessons].reverse())).toBe('b')
  })
})

describe('placeLessons — current lesson (undated)', () => {
  it('makes the first lesson in display order current', () => {
    const placement = placeLessons({
      lessons: [lesson('second', [], 2), lesson('first', [], 1)],
      sessionDates: null,
      trialDate: null,
      today: d(10, 1),
    })
    expect(placement.currentLessonId).toBe('first')
  })

  it('ignores today entirely', () => {
    const placement = placeLessons({
      lessons: [lesson('b', [3]), lesson('a', [1])],
      sessionDates: null,
      trialDate: TRIAL,
      today: d(1, 1),
    })
    expect(placement.currentLessonId).toBe('a')
  })

  it('returns null for an empty list', () => {
    const placement = placeLessons({ lessons: [], sessionDates: null, trialDate: null, today: d(10, 1) })
    expect(placement).toEqual({ lessons: [], currentLessonId: null })
  })

  it('returns null for an empty list in dated mode too', () => {
    const placement = placeLessons({ lessons: [], sessionDates: SESSION_DATES, trialDate: TRIAL, today: d(10, 1) })
    expect(placement.currentLessonId).toBeNull()
  })
})

describe('formatLessonSessions', () => {
  it.each([
    [[1], '1. sat'],
    [[1, 2], '1.–2. sat'],
    [[1, 3], '1., 3. sat'],
    [[1, 2, 3, 5], '1.–3., 5. sat'],
    [[1, 2, 4, 5, 7], '1.–2., 4.–5., 7. sat'],
    [[0], 'Probni sat'],
    [[0, 1], 'Probni sat, 1. sat'],
    [[0, 1, 2], 'Probni sat, 1.–2. sat'],
    [[5, 1, 2, 3], '1.–3., 5. sat'],
    [[2, 0], 'Probni sat, 2. sat'],
  ])('%j → %s', (input, expected) => {
    expect(formatLessonSessions(input)).toBe(expected)
  })

  it('does not mutate its input', () => {
    const input = [3, 1, 2]
    formatLessonSessions(input)
    expect(input).toEqual([3, 1, 2])
  })
})
