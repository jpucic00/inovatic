import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import { InquiryConfirmationEmail } from '../../../emails/inquiry-confirmation'

const base = {
  parentName: 'Marija Horvat',
  childName: 'Luka Horvat',
  childDateOfBirth: '15.06.2015.',
}

describe('InquiryConfirmationEmail', () => {
  it('includes the chosen city when a cityLabel is given', async () => {
    const html = await render(<InquiryConfirmationEmail {...base} cityLabel="Šibenik" />)
    expect(html).toContain('Odabrani grad')
    expect(html).toContain('Šibenik')
  })

  it('omits the city line when no cityLabel is given', async () => {
    const html = await render(<InquiryConfirmationEmail {...base} />)
    expect(html).not.toContain('Odabrani grad')
  })
})
