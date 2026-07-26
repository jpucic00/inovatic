import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import StemEducationInquiryEmail from '../../../emails/stem-education-inquiry'
import StemEducationConfirmationEmail from '../../../emails/stem-education-confirmation'

const inquiry = {
  contactName: 'Ivana Ivić',
  institutionName: 'OŠ Meje',
  institutionType: 'Osnovna škola',
  email: 'ivana.ivic@skole.hr',
  services: ['Osnovna edukacija mentora', 'Pomoć pri odabiru STEM opreme'],
  message: 'Nabavili smo šest LEGO SPIKE setova, ali ih nitko ne koristi.',
}

describe('StemEducationInquiryEmail (internal notification)', () => {
  it('carries every submitted field — it is the only record of the inquiry', async () => {
    const html = await render(
      <StemEducationInquiryEmail
        {...inquiry}
        phone="091 234 5678"
        trainingPlace="U našoj školi ili ustanovi"
      />,
    )
    expect(html).toContain('Ivana Ivić')
    expect(html).toContain('OŠ Meje')
    expect(html).toContain('Osnovna škola')
    expect(html).toContain('ivana.ivic@skole.hr')
    expect(html).toContain('091 234 5678')
    expect(html).toContain('Osnovna edukacija mentora')
    expect(html).toContain('Pomoć pri odabiru STEM opreme')
    expect(html).toContain('U našoj školi ili ustanovi')
    expect(html).toContain('Nabavili smo šest LEGO SPIKE setova')
  })

  it('omits the optional phone and training-place rows when they are absent', async () => {
    const html = await render(<StemEducationInquiryEmail {...inquiry} />)
    expect(html).not.toContain('Telefon')
    expect(html).not.toContain('Mjesto održavanja')
  })

  it('drops the customer-facing sign-off — it is addressed to the association', async () => {
    const html = await render(<StemEducationInquiryEmail {...inquiry} />)
    expect(html).not.toContain('S poštovanjem')
    expect(html).not.toContain('Kontakt Šibenik')
  })
})

describe('StemEducationConfirmationEmail (to the submitter)', () => {
  it('greets the contact and lists the requested services', async () => {
    const html = await render(
      <StemEducationConfirmationEmail
        contactName="Ivana Ivić"
        institutionName="OŠ Meje"
        services={['Osnovna edukacija mentora', 'Izrada radionica ili kurikuluma']}
      />,
    )
    expect(html).toContain('Hvala na upitu,')
    expect(html).toContain('Ivana Ivić')
    expect(html).toContain('OŠ Meje')
    expect(html).toContain('Osnovna edukacija mentora')
    expect(html).toContain('Izrada radionica ili kurikuluma')
    expect(html).toContain('udruga-inovatic.hr/stem-edukacija')
  })

  it('keeps the standard sign-off and contact footer', async () => {
    const html = await render(
      <StemEducationConfirmationEmail
        contactName="Ivana Ivić"
        institutionName="OŠ Meje"
        services={['Savjetovanje']}
      />,
    )
    expect(html).toContain('S poštovanjem')
    expect(html).toContain('prijave@udruga-inovatic.hr')
  })
})
