/**
 * The bulk-message body used to end with its own contact paragraph hardcoding
 * the Split inbox and phone — wrong for a Šibenik campaign, and redundant with
 * `EmailLayout`'s footer, which already lists both cities. Removing it is only
 * safe as long as the footer really does carry those contacts, so assert on the
 * rendered HTML rather than on the template source.
 */
import { describe, expect, it } from 'vitest'
import { renderBulkMessageHtml } from '@/lib/email'

describe('bulk-message template', () => {
  it('gets both cities from the layout footer, with no hardcoded Split paragraph', async () => {
    const html = await renderBulkMessageHtml({
      subject: 'Upisi u školsku godinu 2026/2027 – Inovatic',
      bodyText: 'Pozivamo vas na upis.',
      includeSignupCta: true,
    })

    expect(html).toContain('prijave@udruga-inovatic.hr')
    expect(html).toContain('prijave.sibenik@udruga-inovatic.hr')
    // The removed body paragraph — a Šibenik parent must not be pointed at Split.
    expect(html).not.toContain('Za sva pitanja slobodno nas kontaktirajte')
    // The invitation CTA is unaffected by the removal.
    expect(html).toContain('/upisi')
  })

  it('renders no signup CTA for a plain custom campaign', async () => {
    const html = await renderBulkMessageHtml({
      subject: 'Obavijest – Inovatic',
      bodyText: 'Kratka obavijest.',
    })
    expect(html).not.toContain('/upisi')
  })
})
