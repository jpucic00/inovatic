/**
 * The two parts of the sign-up confirmation that are not the same for every
 * parent. Both assert on the rendered HTML rather than on props, because in
 * both cases the behaviour *is* whether a passage appears at all:
 *
 *  - the payment instruction (akontacija + ostatak), which must reach radionica
 *    parents and nobody else — a free workshop included, since "0,00 eura" is
 *    not a thing to ask for
 *  - the closing paragraph, which used to promise every parent that we would
 *    contact them with available termini. Since the form gained its termin
 *    dropdown that is untrue for most of them: they picked their own slot, and
 *    being told their termin is still coming reads as if it never arrived.
 */
import { createElement } from 'react'
import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import type { InquiryNextStep } from '@/lib/inquiry-next-step'
import InquiryConfirmationEmail from '../../../emails/inquiry-confirmation'

const baseProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  cityLabel: 'Split',
}

/** The 150 € ciklus, as `radionicaPaymentPlan` renders it. */
const plan = {
  deposit: '30,00',
  remainder: '120,00',
  total: '150,00',
  discountedRemainder: '100,00',
  discountedTotal: '130,00',
}

describe('payment instruction', () => {
  it('carries both the akontacija and the ostatak when payment is owed', async () => {
    const html = await render(
      createElement(InquiryConfirmationEmail, { ...baseProps, payment: plan }),
    )

    expect(html).toContain('NAPOMENA I UPUTE ZA PLAĆANJE')
    expect(html).toContain('HR7223400091110811408')
    expect(html).toContain('UDRUGA ZA ROBOTIKU')
    expect(html).toContain('datum uplate (DDMMGGG)')

    // Akontacija: the amount appears in the sentence, in the box heading and as
    // the box's own Iznos, so the parent never has to work out what to transfer.
    expect(html).toContain('u roku od 3 dana')
    expect(html).toContain('30,00 eura')
    expect(html).toContain('Podaci za uplatu akontacije (30,00 EUR)')
    // Radionice are admin-created with free-text names, so the payment
    // description is deliberately generic — never the workshop's own title.
    expect(html).toContain('Rezervacija za radionicu na ime i prezime djeteta')

    // Ostatak: its own box, its own deadline, and both amounts with the total
    // each one adds up to.
    expect(html).toContain('najkasnije 3 dana prije početka odabranog ciklusa')
    expect(html).toContain('Podaci za uplatu ostatka iznosa')
    expect(html).toContain('120,00 EUR (ukupno 150,00 EUR)')
    expect(html).toContain('100,00 EUR (ukupno 130,00 EUR)')
    expect(html).toContain('drugo dijete / dijete polaznik cjelogodišnjeg programa')
    expect(html).toContain('Ostatak uplate za radionicu na ime i prezime djeteta')

    expect(html).toContain('BRIŠE')
    expect(html).toContain('ne vraćamo uplaćenu akontaciju')
  })

  it('omits the popust line when the plan carries no discounted amount', async () => {
    // A workshop cheap enough that the 20 € popust would leave nothing after
    // the akontacija — the rest of the instruction still stands.
    const html = await render(
      createElement(InquiryConfirmationEmail, {
        ...baseProps,
        payment: { ...plan, discountedRemainder: null, discountedTotal: null },
      }),
    )

    expect(html).toContain('120,00 EUR (ukupno 150,00 EUR)')
    expect(html).not.toContain('Ostatak s popustom')
    expect(html).not.toContain('cjelogodišnjeg programa')
  })

  it('is absent entirely otherwise', async () => {
    // SLR and natjecateljski sign-ups, and any radionica without a price.
    const html = await render(createElement(InquiryConfirmationEmail, baseProps))

    expect(html).toContain('Zaprimili smo vašu prijavu')
    expect(html).not.toContain('NAPOMENA')
    expect(html).not.toContain('akontaciju')
    expect(html).not.toContain('HR7223400091110811408')
  })
})

describe('closing paragraph', () => {
  const closingFor = (nextStep?: InquiryNextStep) =>
    render(createElement(InquiryConfirmationEmail, { ...baseProps, nextStep }))

  it('promises confirmation of the booked termin when one was chosen', async () => {
    const html = await closingFor('TERMIN_CHOSEN')

    expect(html).toContain('Vaš odabrani termin je zabilježen')
    expect(html).toContain('potvrdom upisa')
    expect(html).not.toContain('kontaktirati vas s dostupnim terminima')
  })

  it('promises to agree on a termin when the parent refused the offered ones', async () => {
    const html = await closingFor('TERMIN_TO_ARRANGE')

    expect(html).toContain('dogovorili termin koji vam odgovara')
    // They have already seen and refused the list — do not re-offer it.
    expect(html).not.toContain('kontaktirati vas s dostupnim terminima')
  })

  it('still offers termini when none was on the table', async () => {
    const html = await closingFor('TERMIN_TO_OFFER')

    expect(html).toContain('kontaktirati vas s dostupnim terminima i grupama')
  })

  it('defaults to offering termini, the pre-dropdown wording', async () => {
    expect(await closingFor()).toContain('kontaktirati vas s dostupnim terminima i grupama')
  })
})
