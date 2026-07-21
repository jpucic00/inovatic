import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface AccountCredentialsProps {
  parentName: string
  childName: string
  username: string
  password: string
  groupName: string
  schedule: string
  locationName: string
  /** Full venue address incl. city so a bare venue name is never ambiguous. */
  locationAddress: string
}

function AccountCredentialsEmail({
  parentName,
  childName,
  username,
  password,
  groupName,
  schedule,
  locationName,
  locationAddress,
}: AccountCredentialsProps) {
  return (
    <EmailLayout preview={`Pristupni podaci za ${childName} – Inovatic`}>
      <Heading style={emailStyles.h1}>Poštovani/a {parentName},</Heading>

      <Text style={emailStyles.text}>
        S veseljem vas obavještavamo da je vaše dijete{' '}
        <strong>{childName}</strong> upisano u sustav Inovatic!
      </Text>
      <Section style={credentialsBox}>
        <Text style={credentialsTitle}>Pristupni podaci</Text>
        <Text style={credentialsText}>
          <strong>Korisničko ime:</strong> {username}
          <br />
          <strong>Lozinka:</strong> {password}
        </Text>
      </Section>
      <Text style={emailStyles.textSmall}>
        Molimo vas da sačuvate ove podatke na sigurnom mjestu.
      </Text>

      <Hr style={emailStyles.hr} />

      <Text style={emailStyles.text}>
        <strong>Detalji upisa:</strong>
      </Text>
      <Section style={groupBox}>
        <Text style={groupText}>
          <strong>{groupName}</strong>
          <br />
          {schedule}
          <br />
          📍 {locationName}
          <br />
          <span style={locationAddressText}>{locationAddress}</span>
        </Text>
      </Section>

      <Hr style={emailStyles.hr} />

      <Text style={emailStyles.text}>
        Za sva pitanja slobodno nas kontaktirajte na{' '}
        <Link href="mailto:upisi@udruga-inovatic.hr" style={emailStyles.link}>
          upisi@udruga-inovatic.hr
        </Link>{' '}
        ili na <Link href="tel:+385993936993" style={emailStyles.link}>+385 99 393 6993</Link>.
      </Text>
    </EmailLayout>
  )
}

const credentialsBox = {
  backgroundColor: '#ecfdf5',
  border: '1px solid #6ee7b7',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '16px 0',
}

const credentialsTitle = {
  color: '#065f46',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: '0 0 8px',
}

const credentialsText = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.8',
  margin: '0',
  fontFamily: 'monospace',
}

const groupBox = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 8px',
}

const groupText = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
}

const locationAddressText = {
  color: '#6b7280',
  fontSize: '13px',
}

// Sample data for the `react-email` preview server (`npm run email`).
AccountCredentialsEmail.PreviewProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  username: 'marko.anic',
  password: 'Xk7mQ2ph',
  groupName: 'SLR 2 – utorkom',
  schedule: 'Utorak, 17:00–18:30',
  locationName: 'OŠ Meje',
  locationAddress: 'Prilaz braće Kaliterna 10, 21000 Split',
} satisfies AccountCredentialsProps

export default AccountCredentialsEmail
