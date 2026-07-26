import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import BulkMessageEmail from '../../../emails/bulk-message'
import { renderBulkMessageHtml } from '@/lib/email/senders'

const options = [
  {
    groupName: 'SLR 2 – utorkom',
    schedule: 'Utorak, 17:00–18:30',
    locationName: 'OŠ Meje',
    locationAddress: 'Prilaz braće Kaliterna 10, 21000 Split',
  },
]

describe('BulkMessageEmail template', () => {
  it('renders paragraphs, schedule box and CTA in the full (invitation) variant', async () => {
    const html = await render(
      <BulkMessageEmail
        subject="Upisi – Inovatic"
        bodyText={'Poštovani,\nPrvi odlomak poruke.\nDrugi odlomak poruke.'}
        options={options}
        signupUrl="https://udruga-inovatic.hr/upisi"
      />,
    )
    expect(html).toContain('Poštovani,')
    expect(html).toContain('Prvi odlomak poruke.')
    expect(html).toContain('Drugi odlomak poruke.')
    expect(html).toContain('Termini u novoj školskoj godini:')
    expect(html).toContain('SLR 2 – utorkom')
    expect(html).toContain('Utorak, 17:00–18:30')
    expect(html).toContain('Prilaz braće Kaliterna 10, 21000 Split')
    expect(html).toContain('https://udruga-inovatic.hr/upisi')
    expect(html).toContain('Ispunite prijavu')
  })

  it('renders neither schedule section nor CTA in the custom variant', async () => {
    const html = await render(
      <BulkMessageEmail subject="Obavijest – Inovatic" bodyText="Kratka obavijest roditeljima." />,
    )
    expect(html).toContain('Kratka obavijest roditeljima.')
    expect(html).not.toContain('Termini u novoj školskoj godini:')
    expect(html).not.toContain('Ispunite prijavu')
    expect(html).not.toContain('/upisi')
  })

  it('never auto-prepends a greeting — the body ships exactly as written', async () => {
    const html = await render(
      <BulkMessageEmail subject="Obavijest" bodyText="Tekst poruke bez pozdrava." />,
    )
    expect(html).toContain('Tekst poruke bez pozdrava.')
    expect(html).not.toContain('Poštovani')
  })
})

describe('renderBulkMessageHtml', () => {
  it('injects the /upisi CTA link only when includeSignupCta is set', async () => {
    const base = { subject: 'Upisi', bodyText: 'Tekst poruke.' }
    const withCta = await renderBulkMessageHtml({ ...base, includeSignupCta: true })
    const withoutCta = await renderBulkMessageHtml(base)
    expect(withCta).toContain('/upisi')
    expect(withoutCta).not.toContain('/upisi')
  })
})
