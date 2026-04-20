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

interface TeacherCredentialsProps {
  firstName: string
  lastName: string
  email: string
  password: string
  loginUrl: string
}

export function TeacherCredentialsEmail({
  firstName,
  lastName,
  email,
  password,
  loginUrl,
}: TeacherCredentialsProps) {
  return (
    <Html>
      <Head />
      <Preview>Pristupni podaci – Inovatic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            Poštovani/a {firstName} {lastName},
          </Heading>

          <Text style={text}>
            Dobrodošli u sustav Inovatic. Administrator vam je kreirao račun
            nastavnika. Od sada se možete prijaviti pomoću podataka ispod i
            upravljati svojim grupama i nastavnim materijalima.
          </Text>

          <Section style={credentialsBox}>
            <Text style={credentialsTitle}>Pristupni podaci</Text>
            <Text style={credentialsText}>
              <strong>E-mail:</strong> {email}
              <br />
              <strong>Lozinka:</strong> {password}
            </Text>
          </Section>

          <Text style={textSmall}>
            Molimo vas da sačuvate ove podatke na sigurnom mjestu. Nakon prve
            prijave preporučujemo promjenu lozinke.
          </Text>

          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Link href={loginUrl} style={button}>
              Prijavi se
            </Link>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Za sva pitanja slobodno nas kontaktirajte na{' '}
            <Link href="mailto:prijave@udruga-inovatic.hr" style={link}>
              prijave@udruga-inovatic.hr
            </Link>
            .
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

const button = {
  backgroundColor: '#0891b2',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '15px',
  fontWeight: '600' as const,
  display: 'inline-block',
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
