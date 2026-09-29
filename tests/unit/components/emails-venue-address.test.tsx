import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import ScheduleOptionsEmail from '../../../emails/schedule-options'

// City tenancy PR8: a bare venue name like "Trokut" is ambiguous to a parent,
// so both transactional emails render the full venue address (which carries the
// city) next to Location.name.
const trokutName = 'Trokut inkubator'
const trokutAddress = 'Ul. Velimira Škorpika 7/a, 22000 Šibenik'

describe('venue address in transactional emails', () => {
  it('ScheduleOptionsEmail renders the venue address under the venue name', async () => {
    const html = await render(
      <ScheduleOptionsEmail
        parentName="Marija Horvat"
        childName="Luka Horvat"
        options={[
          {
            groupName: 'SLR 1 – Šibenik',
            schedule: 'Ponedjeljak, 17:00–18:30',
            locationName: trokutName,
            locationAddress: trokutAddress,
          },
        ]}
      />,
    )
    expect(html).toContain(trokutName)
    expect(html).toContain(trokutAddress)
  })
})
