import { describe, expect, it } from 'vitest'
import { toGroupOptions, type GroupOptionSource } from '@/lib/email-campaign-options'

function group(overrides: Partial<GroupOptionSource> = {}): GroupOptionSource {
  return {
    name: 'SLR 2 – četvrtkom',
    dayOfWeek: 'Četvrtak',
    dateStart: null,
    dateEnd: null,
    startTime: '18:30',
    endTime: '20:00',
    location: { name: 'Velebitska 32', address: 'Velebitska 32, Split' },
    course: { kind: 'STANDARD' },
    ...overrides,
  }
}

describe('toGroupOptions', () => {
  it('renders a standard group as weekday + time at its venue', () => {
    expect(toGroupOptions([group()])).toEqual([
      {
        groupName: 'SLR 2 – četvrtkom',
        schedule: 'Četvrtak · 18:30–20:00',
        locationName: 'Velebitska 32',
        locationAddress: 'Velebitska 32, Split',
      },
    ])
  })

  it('renders a radionica as its date range, not a weekday', () => {
    const [option] = toGroupOptions([
      group({
        course: { kind: 'RADIONICA' },
        dateStart: '2026-09-01',
        dateEnd: '2026-09-05',
      }),
    ])
    expect(option.schedule).toBe('01.09.2026. – 05.09.2026. · 18:30–20:00')
  })

  it('falls back to a generic label for an unnamed group', () => {
    expect(toGroupOptions([group({ name: null })])[0].groupName).toBe('Grupa')
  })
})
