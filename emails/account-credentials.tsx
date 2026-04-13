import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from '@react-email/components'

interface AccountCredentialsProps {
  parentName: string
  childName: string
  username: string
  password: string
  groupName: string
  schedule: string
  locationName: string
}

export function AccountCredentialsEmail({
  parentName,
  childName,
  username,
  password,
  groupName,
  schedule,
  locationName,
}: AccountCredentialsProps) {
  return (
    <Html>
      <Head />
      <Preview>Pristupni podaci za {childName} – Inovatic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Poštovani/a {parentName},</Heading>

          <Text style={text}>
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
          <Text style={textSmall}>
            Molimo vas da sačuvate ove podatke na sigurnom mjestu.
          </Text>

          <Hr style={hr} />

          <Text style={text}>
            <strong>Detalji upisa:</strong>
          </Text>
          <Section style={groupBox}>
            <Text style={groupText}>
              <strong>{groupName}</strong>
              <br />
              {schedule}
              <br />
              📍 {locationName}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Za sva pitanja slobodno nas kontaktirajte na{' '}
            <Link href="mailto:prijave@udruga-inovatic.hr" style={link}>
              prijave@udruga-inovatic.hr
            </Link>{' '}
            ili na <Link href="tel:+385993936993" style={link}>+385 99 393 6993</Link>.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            S poštovanjem,
            <br />
            <strong>Tim Inovatic</strong>
            <br />
            Udruga za robotiku &quot;Inovatic&quot;
            <br />
            prijave@udruga-inovatic.hr | +385 99 393 6993
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f8fafc',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '40px 24px',
  maxWidth: '560px',
}

const h1 = {
  color: '#0891b2',
  fontSize: '24px',
  fontWeight: '700' as const,
  margin: '0 0 24px',
}

const text = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const textSmall = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 16px',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
}

const link = {
  color: '#0891b2',
}

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
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
