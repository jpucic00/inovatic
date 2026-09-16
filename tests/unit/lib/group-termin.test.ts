import { describe, expect, it } from 'vitest'
import { toGroupTermin } from '@/lib/group-termin'

const location = { name: 'Velebitska 32', address: 'Velebitska 32, 21000 Split' }

describe('toGroupTermin', () => {
  it('renders a weekly group as its weekday and time', () => {
    expect(
      toGroupTermin({
        name: 'SLR 2 – utorkom',
        dayOfWeek: 'Utorak',
        dateStart: null,
        dateEnd: null,
        startTime: '17:00',
        endTime: '18:30',
        course: { title: 'Svijet LEGO robotike 2', kind: 'STANDARD' },
        location,
      }),
    ).toEqual({
      programTitle: 'Svijet LEGO robotike 2',
      groupName: 'SLR 2 – utorkom',
      schedule: 'Utorak · 17:00–18:30',
      locationName: 'Velebitska 32',
      locationAddress: 'Velebitska 32, 21000 Split',
    })
  })

  it('renders a radionica as its date range, never a weekday', () => {
    // A radionica runs a closed range; its dayOfWeek column is null and must
    // not be what a parent is told to turn up on.
    expect(
      toGroupTermin({
        name: null,
        dayOfWeek: null,
        dateStart: '2026-07-15',
        dateEnd: '2026-07-21',
        startTime: '09:00',
        endTime: '11:00',
        course: { title: 'Ljetna LEGO radionica', kind: 'RADIONICA' },
        location,
      }),
    ).toMatchObject({
      groupName: null,
      schedule: '15.07.2026. – 21.07.2026. · 09:00–11:00',
    })
  })
})
