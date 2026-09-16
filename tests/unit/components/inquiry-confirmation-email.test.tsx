import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import InquiryConfirmationEmail from '../../../emails/inquiry-confirmation'

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

/**
 * The "Odabrani termin" box is what lets the mail answer "what did I sign up
 * for, and when" on its own — the reason it exists is that parents were
 * writing in during the probni tjedan with exactly that question.
 */
describe('InquiryConfirmationEmail — the booked termin', () => {
  const termin = {
    programTitle: 'Svijet LEGO robotike 2',
    groupName: 'SLR 2 – utorkom',
    schedule: 'Utorak · 17:00–18:30',
    locationName: 'Trokut inkubator',
    locationAddress: 'Ul. Velimira Škorpika 7/a, 22000 Šibenik',
  }

  it('prints the program, group, day and time, and the venue with its address', async () => {
    const html = await render(<InquiryConfirmationEmail {...base} termin={termin} />)
    expect(html).toContain('Odabrani termin')
    expect(html).toContain('Svijet LEGO robotike 2')
    expect(html).toContain('SLR 2 – utorkom')
    expect(html).toContain('Utorak · 17:00–18:30')
    expect(html).toContain('Trokut inkubator')
    expect(html).toContain('Ul. Velimira Škorpika 7/a, 22000 Šibenik')
  })

  it('skips the group line when the group has no name of its own', async () => {
    // A nameless group would otherwise print an empty line under the program.
    const html = await render(
      <InquiryConfirmationEmail {...base} termin={{ ...termin, groupName: null }} />,
    )
    expect(html).toContain('Svijet LEGO robotike 2')
    expect(html).not.toContain('SLR 2 – utorkom')
  })

  it('renders no termin box when nothing was booked', async () => {
    // The closing paragraph then carries the promise to get back to them;
    // an empty "Odabrani termin" heading would contradict it.
    const html = await render(<InquiryConfirmationEmail {...base} />)
    expect(html).not.toContain('Odabrani termin')
  })
})
