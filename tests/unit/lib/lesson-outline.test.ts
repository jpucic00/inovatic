import { describe, expect, it } from 'vitest'
import { buildLessonOutline, formatSatDateRange, satDateLabel } from '@/lib/lesson-outline'

const lesson = (id: string, sessionNumbers: number[]) => ({ id, sessionNumbers })

const shape = (entries: ReturnType<typeof buildLessonOutline<{ id: string; sessionNumbers: number[] }>>) =>
  entries.map((e) => (e.kind === 'lesson' ? e.lesson.id : `free:${e.sessionNumber}`))

describe('buildLessonOutline', () => {
  it('lists undated lessons as they come, with no free rows', () => {
    const out = buildLessonOutline({
      lessons: [lesson('a', []), lesson('b', [])],
      dated: false,
      isFirstModule: false,
    })
    expect(shape(out)).toEqual(['a', 'b'])
  })

  it('shows every free sat of a dated module in position', () => {
    const out = buildLessonOutline({
      lessons: [lesson('a', [1]), lesson('b', [2, 3]), lesson('c', [6])],
      dated: true,
      isFirstModule: false,
    })
    expect(shape(out)).toEqual(['a', 'b', 'free:4', 'free:5', 'c', 'free:7'])
  })

  it('adds the probni sat slot only on the first module', () => {
    const first = buildLessonOutline({ lessons: [], dated: true, isFirstModule: true })
    expect(shape(first)[0]).toBe('free:0')
    expect(first).toHaveLength(8)
    const later = buildLessonOutline({ lessons: [], dated: true, isFirstModule: false })
    expect(shape(later)[0]).toBe('free:1')
    expect(later).toHaveLength(7)
  })

  it('lists a lesson once, at its first sat, even with a gap in its sats', () => {
    const out = buildLessonOutline({
      lessons: [lesson('a', [0, 1]), lesson('b', [2, 4])],
      dated: true,
      isFirstModule: true,
    })
    expect(shape(out)).toEqual(['a', 'b', 'free:3', 'free:5', 'free:6', 'free:7'])
  })

  it('keeps dateless lessons of a dated module after the sats', () => {
    const out = buildLessonOutline({
      lessons: [lesson('a', [1]), lesson('x', [])],
      dated: true,
      isFirstModule: false,
    })
    expect(shape(out).at(-1)).toBe('x')
    expect(shape(out)).toContain('a')
  })

  it('never drops a lesson whose only sat is outside the module slots', () => {
    const out = buildLessonOutline({ lessons: [lesson('p', [0])], dated: true, isFirstModule: false })
    expect(shape(out)).toContain('p')
  })
})

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day))

describe('formatSatDateRange', () => {
  it('prints one day when every weekday agrees', () => {
    expect(formatSatDateRange(d(2026, 10, 5), d(2026, 10, 5))).toBe('05.10.')
  })

  it('shares the month inside one month', () => {
    expect(formatSatDateRange(d(2026, 10, 20), d(2026, 10, 25))).toBe('20.–25.10.')
  })

  it('names both months across a month boundary', () => {
    expect(formatSatDateRange(d(2026, 10, 28), d(2026, 11, 3))).toBe('28.10.–03.11.')
    expect(formatSatDateRange(d(2026, 12, 28), d(2027, 1, 2))).toBe('28.12.–02.01.')
  })
})

describe('satDateLabel', () => {
  it('finds the sat or answers null', () => {
    const ranges = [{ sessionNumber: 3, from: d(2026, 10, 19), to: d(2026, 10, 24) }]
    expect(satDateLabel(ranges, 3)).toBe('19.–24.10.')
    expect(satDateLabel(ranges, 4)).toBeNull()
  })
})
