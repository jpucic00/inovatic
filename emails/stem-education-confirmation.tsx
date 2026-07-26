import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface StemEducationConfirmationProps {
  contactName: string
  institutionName: string
  /** Human-readable Croatian labels of the requested services. */
  services: string[]
}

const listStyle = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 16px',
  paddingLeft: '20px',
}

/** Confirmation for the person who submitted the /stem-edukacija form. */
function StemEducationConfirmationEmail({
  contactName,
  institutionName,
  services,
}: StemEducationConfirmationProps) {
  return (
    <EmailLayout preview="Zaprimili smo vaš upit za STEM edukaciju – Inovatic">
      <Heading style={emailStyles.h1}>Hvala na upitu, {contactName}!</Heading>
      <Text style={emailStyles.text}>
        Zaprimili smo vaš upit za STEM edukaciju za ustanovu <strong>{institutionName}</strong>.
      </Text>
      <Text style={emailStyles.text}>Zatražili ste:</Text>
      <ul style={listStyle}>
        {services.map((service) => (
          <li key={service}>{service}</li>
        ))}
      </ul>
      <Hr style={emailStyles.hr} />
      <Text style={emailStyles.text}>
        Pregledat ćemo vaše potrebe i javiti vam se s prijedlogom sadržaja, trajanja i načina
        provedbe edukacije te ponudom prilagođenom vašoj ustanovi.
      </Text>
      <Section>
        <Text style={emailStyles.text}>
          Više o edukacijama za učitelje, nastavnike i mentore možete pročitati na{' '}
          <Link href="https://udruga-inovatic.hr/stem-edukacija" style={emailStyles.link}>
            udruga-inovatic.hr/stem-edukacija
          </Link>
          .
        </Text>
      </Section>
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`).
StemEducationConfirmationEmail.PreviewProps = {
  contactName: 'Ivana Ivić',
  institutionName: 'OŠ Meje',
  services: ['Osnovna edukacija mentora', 'Pomoć pri odabiru STEM opreme'],
} satisfies StemEducationConfirmationProps

export default StemEducationConfirmationEmail
