/**
 * What the staff notification actually renders. The template is the only thing
 * standing between a submitted form and someone acting on it, so the assertions
 * here are about completeness and about not printing empty rows:
 *
 *  - every submitted field reaches the inbox, because the point of the mail is
 *    triaging an upit without opening the admin
 *  - the parent's address and phone are click-to-act links, since the reply and
 *    the phone call are what happens next
 *  - a PARTY submission has no child, program or termin, and must not render
 *    those labels with nothing under them
 *  - the association's own contact card is suppressed — this is a mail TO the
 *    association, not from it
 */
import { createElement } from 'react'
import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import InquiryNotificationEmail from '../../../emails/inquiry-notification'

const courseProps = {
  kind: 'COURSE' as const,
  cityLabel: 'Šibenik',
  parentName: 'Ana Anić',
  parentEmail: 'ana.anic@example.hr',
  parentPhone: '091 234 5678',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  childSchool: 'OŠ Petra Krešimira IV.',
  gradeLabel: '3. razred',
  programName: 'Svijet LEGO robotike 2',
  terminLabel: 'SLR 2 · Utorak · 17:00–18:30 · Trokut inkubator',
  message: 'Marko je prošle godine završio SLR 1.',
  referralSource: 'Preporuka prijateljice',
  adminUrl: 'https://udruga-inovatic.hr/admin/upiti/clx123',
}

describe('course inquiry notification', () => {
  it('carries every submitted field', async () => {
    const html = await render(createElement(InquiryNotificationEmail, courseProps))

    expect(html).toContain('Novi upit za upis')
    for (const value of [
      'Šibenik',
      'Ana Anić',
      'ana.anic@example.hr',
      '091 234 5678',
      'Marko Anić',
      '15.06.2016.',
      'OŠ Petra Krešimira IV.',
      '3. razred',
      'Svijet LEGO robotike 2',
      'SLR 2',
      'Trokut inkubator',
      'Marko je prošle godine završio SLR 1.',
      'Preporuka prijateljice',
    ]) {
      expect(html).toContain(value)
    }
  })

  it('links the parent for reply and phone, and the upit for action', async () => {
    const html = await render(createElement(InquiryNotificationEmail, courseProps))

    expect(html).toContain('mailto:ana.anic@example.hr')
    // Spaces stripped so the tel: link dials.
    expect(html).toContain('tel:0912345678')
    expect(html).toContain('https://udruga-inovatic.hr/admin/upiti/clx123')
  })

  it('omits rows the parent left blank rather than labelling nothing', async () => {
    const html = await render(
      createElement(InquiryNotificationEmail, {
        kind: 'COURSE' as const,
        cityLabel: 'Split',
        parentName: 'Ana Anić',
        parentEmail: 'ana.anic@example.hr',
        parentPhone: '091 234 5678',
        childName: 'Marko Anić',
        childDateOfBirth: '15.06.2016.',
        adminUrl: 'https://udruga-inovatic.hr/admin/upiti/clx123',
      }),
    )

    expect(html).not.toContain('Škola')
    expect(html).not.toContain('Željeni termin')
    expect(html).not.toContain('Poruka')
    expect(html).not.toContain('Izvor saznanja')
  })

  it('does not close with the association’s own contact card', async () => {
    // This mail goes TO prijave@ — signing it off with prijave@'s details and a
    // "S poštovanjem, Tim Inovatic" reads as though a parent sent it.
    const html = await render(createElement(InquiryNotificationEmail, courseProps))

    expect(html).not.toContain('S poštovanjem')
    expect(html).not.toContain('Kontakt Split')
  })
})

describe('party inquiry notification', () => {
  it('renders the proslava heading and the preferred date, with no child section', async () => {
    const html = await render(
      createElement(InquiryNotificationEmail, {
        kind: 'PARTY' as const,
        cityLabel: 'Split',
        parentName: 'Ana Anić',
        parentEmail: 'ana.anic@example.hr',
        parentPhone: '091 234 5678',
        message: 'Zanima nas proslava za 12 djece.',
        partyProposedDate: '12.09.2026.',
        adminUrl: 'https://udruga-inovatic.hr/admin/upiti/clx456',
      }),
    )

    expect(html).toContain('Novi upit za proslavu')
    expect(html).toContain('12.09.2026.')
    expect(html).toContain('Zanima nas proslava za 12 djece.')
    expect(html).not.toContain('Dijete')
    expect(html).not.toContain('Razred')
    expect(html).not.toContain('Željeni program')
  })
})
