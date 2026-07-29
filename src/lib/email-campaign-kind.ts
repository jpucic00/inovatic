import type { EmailCampaignKind } from '@prisma/client'

/**
 * How each campaign kind is named and described across the admin UI — the
 * composer's kind toggle, the history badge and the campaign detail heading all
 * read from here, so the three cannot drift into calling the same send three
 * different things.
 */
export const EMAIL_CAMPAIGN_KINDS: Record<
  EmailCampaignKind,
  { label: string; badgeLabel: string; badgeClass: string; description: string }
> = {
  CUSTOM: {
    label: 'Prilagođena poruka',
    badgeLabel: 'Prilagođena',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    description:
      'Slobodna poruka u standardnom Inovatic predlošku (logo i podnožje dodaju se automatski).',
  },
  REENROLLMENT: {
    label: 'Pozivnica za ponovni upis',
    badgeLabel: 'Pozivnica za upis',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    description:
      'Pozivnica prošlogodišnjim polaznicima s terminima grupa i poveznicom na prijavnicu.',
  },
  EVALUATION: {
    label: 'Evaluacija (izvještaj)',
    badgeLabel: 'Evaluacija',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    description:
      'Svaki roditelj prima jedan e-mail s evaluacijom svog djeteta. Dijete se navodi u predmetu poruke, a poruka sadrži isključivo njegovu karticu.',
  },
}

/** Ordered for the composer's kind toggle. */
export const EMAIL_CAMPAIGN_KIND_ORDER: readonly EmailCampaignKind[] = [
  'CUSTOM',
  'REENROLLMENT',
  'EVALUATION',
]
