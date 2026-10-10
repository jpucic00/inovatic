import { describe, expect, it } from 'vitest'
import { moduleSatDateRanges } from '@/lib/lesson-sat-dates'

const d = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day))
const key = (date: Date) => date.toISOString().slice(0, 10)

// Module 1 starts Monday 5.10.2026; seven sats a week apart per weekday.
const modules = [
  { id: 'm1', title: 'Modul 1', sortOrder: 1, schedule: { id: 's1', startDate: d(10, 5), endDate: d(11, 21) } },
  { id: 'm2', title: 'Modul 2', sortOrder: 2, schedule: { id: 's2', startDate: d(11, 23), endDate: d(1, 30) } },
]

describe('moduleSatDateRanges', () => {
  it('spans Monday to Saturday for each sat when no holiday intervenes', () => {
    const ranges = moduleSatDateRanges({ modules, holidayDates: new Set(), trialWeek: null })
    const m1 = ranges.get('m1') ?? []
    expect(m1.map((r) => r.sessionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(key(m1[0].from)).toBe('2026-10-05')
    expect(key(m1[0].to)).toBe('2026-10-10')
    expect(key(m1[2].from)).toBe('2026-10-19')
    expect(key(m1[2].to)).toBe('2026-10-24')
  })

  it('widens a sat range when a holiday pushes one weekday back a week', () => {
    // Wednesday 21.10. is off: Wednesday groups hold 3. sat on 28.10.
    const ranges = moduleSatDateRanges({
      modules,
      holidayDates: new Set(['2026-10-21']),
      trialWeek: null,
    })
    const sat3 = (ranges.get('m1') ?? []).find((r) => r.sessionNumber === 3)
    expect(key(sat3!.from)).toBe('2026-10-19')
    expect(key(sat3!.to)).toBe('2026-10-28')
  })

  it('places the probni sat on the first module only, from the trial week', () => {
    const ranges = moduleSatDateRanges({
      modules,
      holidayDates: new Set(),
      trialWeek: { startDate: d(9, 28), endDate: d(10, 3) },
    })
    const probni = (ranges.get('m1') ?? []).find((r) => r.sessionNumber === 0)
    expect(key(probni!.from)).toBe('2026-09-28')
    expect(key(probni!.to)).toBe('2026-10-03')
    expect((ranges.get('m2') ?? []).some((r) => r.sessionNumber === 0)).toBe(false)
  })

  it('has no ranges for a module without a schedule', () => {
    const ranges = moduleSatDateRanges({
      modules: [{ ...modules[0], schedule: null }],
      holidayDates: new Set(),
      trialWeek: null,
    })
    expect(ranges.get('m1')).toBeUndefined()
  })
})
