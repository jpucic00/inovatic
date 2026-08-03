/**
 * The two parts of the sign-up confirmation that are not the same for every
 * parent. Both assert on the rendered HTML rather than on props, because in
 * both cases the behaviour *is* whether a passage appears at all:
 *
 *  - the akontacija instruction, which must reach radionica parents and nobody
 *    else — a free workshop included, since "0,00 eura" is not a thing to ask for
 *  - the closing paragraph, which used to promise every parent that we would
 *    contact them with available termini. Since the form gained its termin
 *    dropdown that is untrue for most of them: they picked their own slot, and
 *    being told their termin is still coming reads as if it never arrived.
 */
import { createElement } from 'react'
import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import InquiryConfirmationEmail, {
  type InquiryNextStep,
} from '../../../emails/inquiry-confirmation'

const baseProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  cityLabel: 'Split',
}

describe('akontacija instruction', () => {
  it('is carried in full when a deposit is owed', async () => {
    const html = await render(
      createElement(InquiryConfirmationEmail, { ...baseProps, depositAmount: '30,00 eura' }),
    )

    expect(html).toContain('NAPOMENA')
    expect(html).toContain('30,00 eura')
    expect(html).toContain('HR7223400091110811408')
    expect(html).toContain('UDRUGA ZA ROBOTIKU')
    expect(html).toContain('datum uplate (DDMMGGG)')
    expect(html).toContain('u roku od 3 dana')
    expect(html).toContain('BRIŠE')
    expect(html).toContain('ne vraćamo uplaćenu akontaciju')
    // Radionice are admin-created with free-text names, so the payment
    // description is deliberately generic — never the workshop's own title.
    expect(html).toContain('Rezervacija za radionicu na ime i prezime djeteta')
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
