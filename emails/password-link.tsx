import { Heading, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
import { PasswordLinkBlock } from './components/password-link-card'
import type { PasswordLinkCard } from '../src/lib/credentials-email-recipients'

interface PasswordLinkProps {
  /** SETUP — a first password (new account, deploy rollout); RESET — sent
   *  from a profile because someone lost access. */
  purpose: 'SETUP' | 'RESET'
  /** Staff are told which panel the login opens; a parent is told about the portal. */
  audience: 'PARENT' | 'STAFF'
  card: PasswordLinkCard
}

const INTRO: Record<PasswordLinkProps['audience'], Record<PasswordLinkProps['purpose'], string>> = {
  PARENT: {
    SETUP:
      'U portalu udruge Inovatic vidite materijale, fotografije i evaluaciju svoje djece. Prijavljujete se svojim e-mailom, a lozinku birate sami — preko poveznice ispod.',
    RESET:
      'Poslali smo vam poveznicu za novu lozinku za portal udruge Inovatic, kako ste zatražili.',
  },
  STAFF: {
    SETUP:
      'Za rad u sustavu Inovatic prijavljujete se svojim e-mailom. Umjesto lozinke koju ste dobili od nas, odaberite vlastitu — preko poveznice ispod.',
    RESET: 'Poslali smo vam poveznicu za novu lozinku za sustav Inovatic, kako ste zatražili.',
  },
}

function PasswordLinkEmail({ purpose, audience, card }: PasswordLinkProps) {
  return (
    <EmailLayout preview={purpose === 'SETUP' ? 'Postavite lozinku – Inovatic' : 'Nova lozinka – Inovatic'}>
      <Heading style={emailStyles.h1}>
        {purpose === 'SETUP' ? 'Postavite lozinku' : 'Nova lozinka'}
      </Heading>
      <Text style={emailStyles.text}>{INTRO[audience][purpose]}</Text>
      <PasswordLinkBlock card={card} />
      {purpose === 'RESET' && (
        <Text style={emailStyles.textSmall}>
          Ako niste tražili novu lozinku, zanemarite ovu poruku — dosadašnja lozinka ostaje.
        </Text>
      )}
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`).
PasswordLinkEmail.PreviewProps = {
  purpose: 'SETUP',
  audience: 'PARENT',
  card: {
    email: 'ivana.anic@example.com',
    children: [
      { name: 'Ana Anić', groups: [] },
      { name: 'Marko Anić', groups: [] },
    ],
    url: 'https://udruga-inovatic.hr/postavi-lozinku#preview-token',
    validFor: '7 dana',
  },
} satisfies PasswordLinkProps

export default PasswordLinkEmail
