import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface PartyInquiryConfirmationProps {
  parentName: string
  /** Optional preferred date, pre-formatted as dd.MM.yyyy. */
  proposedDate?: string
}

function PartyInquiryConfirmationEmail({
  parentName,
  proposedDate,
}: PartyInquiryConfirmationProps) {
  return (
    <EmailLayout preview="Zaprimili smo vaš upit za proslavu rođendana – Inovatic">
      <Heading style={emailStyles.h1}>Hvala na upitu, {parentName}!</Heading>
      <Text style={emailStyles.text}>
        Zaprimili smo vaš upit za proslavu rođendana uz LEGO robotiku. 🎉
      </Text>
      {proposedDate && (
        <Text style={emailStyles.text}>
          Predloženi datum: <strong>{proposedDate}</strong>
        </Text>
      )}
      <Hr style={emailStyles.hr} />
      <Text style={emailStyles.text}>
        Naš tim će pregledati vaš upit i kontaktirati vas radi dogovora termina i detalja
        proslave u najkraćem mogućem roku.
      </Text>
      <Section>
        <Text style={emailStyles.text}>
          U međuvremenu, više o proslavama možete saznati na{' '}
          <Link href="https://udruga-inovatic.hr/proslave" style={emailStyles.link}>
            udruga-inovatic.hr/proslave
          </Link>
          .
        </Text>
      </Section>
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`) — with an
// optional proposed date populated.
PartyInquiryConfirmationEmail.PreviewProps = {
  parentName: 'Ana Anić',
  proposedDate: '15.08.2026.',
} satisfies PartyInquiryConfirmationProps

export default PartyInquiryConfirmationEmail
