import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import BulkMessageEmail from '../../../emails/bulk-message'
import type { EvaluationCard } from '@/lib/evaluation-email-cards'

/**
 * Renders the evaluation e-mail through the same template the send path uses.
 *
 * Worth doing at this level because the card is the one template that derives
 * its content from shared app code (`skillCategories`): these assertions are
 * what catch the rubric or the chip palette silently failing to reach the inbox,
 * which no amount of testing the action would reveal.
 */
function html(card: EvaluationCard): Promise<string> {
  return render(
    <BulkMessageEmail
      subject={`Evaluacija – ${card.childName}`}
      bodyText={'Poštovani,\nU nastavku se nalazi evaluacija Vašeg djeteta.'}
      cards={[card]}
    />,
  )
}

const STANDARD_CARD: EvaluationCard = {
  childName: 'Ana Anić',
  groupLabel: 'SLR 2 – utorkom · Svijet LEGO robotike 2',
  kind: 'STANDARD',
  skills: {
    slaganje: 'OSTVARENO',
    programiranje: 'U_RAZVOJU',
    razradaIdeja: null,
    izvedivost: null,
    inovacije: 'OSTVARENO',
    suradnja: 'OSTVARENO',
    komunikacija: 'U_RAZVOJU',
    zabava: null,
  },
  opisnaOcjena: 'Ana je kroz godinu pokazala veliki napredak.',
  recommendationLabel: 'Svijet LEGO robotike 3',
  authorName: 'Ime Nastavnika',
  updatedAtLabel: '30.06.2026.',
}

const COMPETITION_CARD: EvaluationCard = {
  ...STANDARD_CARD,
  childName: 'Grga Marić',
  groupLabel: 'WRO – srijedom · Natjecateljski program',
  kind: 'COMPETITION',
  skills: {
    ...STANDARD_CARD.skills,
    slaganje: null,
    programiranje: null,
    razradaIdeja: 'OSTVARENO',
    izvedivost: 'U_RAZVOJU',
  },
  recommendationLabel: 'Natjecateljski program – WRO',
}

describe('evaluation e-mail', () => {
  it('renders the child, the group and the admin’s own message', async () => {
    const out = await html(STANDARD_CARD)
    expect(out).toContain('Ana Anić')
    expect(out).toContain('SLR 2 – utorkom')
    expect(out).toContain('U nastavku se nalazi evaluacija Vašeg djeteta.')
    expect(out).toContain('Ana je kroz godinu pokazala veliki napredak.')
    expect(out).toContain('Svijet LEGO robotike 3')
    expect(out).toContain('Ime Nastavnika')
  })

  it('uses the STANDARD rubric for a standard group', async () => {
    const out = await html(STANDARD_CARD)
    expect(out).toContain('Slaganje')
    expect(out).toContain('Programiranje')
    expect(out).not.toContain('Razrada ideja')
    expect(out).not.toContain('Izvedivost')
  })

  it('uses the COMPETITION rubric for a competition group', async () => {
    const out = await html(COMPETITION_CARD)
    expect(out).toContain('Razrada ideja')
    expect(out).toContain('Izvedivost')
    expect(out).not.toContain('Slaganje')
    expect(out).not.toContain('Programiranje')
  })

  it('renders the team skills in both rubrics', async () => {
    for (const card of [STANDARD_CARD, COMPETITION_CARD]) {
      const out = await html(card)
      expect(out).toContain('Suradnja')
      expect(out).toContain('Komunikacija')
      expect(out).toContain('Zabava')
    }
  })

  it('shows all three levels per skill with the achieved one filled', async () => {
    const out = await html(STANDARD_CARD)
    expect(out).toContain('Početno')
    expect(out).toContain('U razvoju')
    expect(out).toContain('Ostvareno')
    // Literal hexes, since e-mail has no Tailwind — emerald-500 for OSTVARENO,
    // sky-500 for U_RAZVOJU, grey for the levels not achieved.
    expect(out).toContain('#10b981')
    expect(out).toContain('#0ea5e9')
    expect(out).toContain('#9ca3af')
  })

  it('marks an ungraded skill rather than leaving it blank', async () => {
    const out = await html(STANDARD_CARD)
    expect(STANDARD_CARD.skills.zabava).toBeNull()
    expect(out).toContain('Nije ocijenjeno')
  })

  it('omits the opisna ocjena and preporuka sections when there are none', async () => {
    const out = await html({
      ...STANDARD_CARD,
      opisnaOcjena: null,
      recommendationLabel: null,
    })
    expect(out).not.toContain('Opisna ocjena')
    expect(out).not.toContain('Preporuka mentora')
    // The rubric itself still renders.
    expect(out).toContain('Slaganje')
  })

  it('carries no schedule boxes or signup CTA — that is the invitation kind', async () => {
    const out = await html(STANDARD_CARD)
    expect(out).not.toContain('Termini u novoj školskoj godini')
    expect(out).not.toContain('Ispunite prijavu')
  })
})
