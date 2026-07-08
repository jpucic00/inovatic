import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

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
    <EmailLayout preview="Pristupni podaci – Inovatic">
      <Heading style={emailStyles.h1}>
        Poštovani/a {firstName} {lastName},
      </Heading>

      <Text style={emailStyles.text}>
        Dobrodošli u sustav Inovatic. Administrator vam je kreirao račun nastavnika. Od
        sada se možete prijaviti pomoću podataka ispod i upravljati svojim grupama i
        nastavnim materijalima.
      </Text>

      <Section style={credentialsBox}>
        <Text style={credentialsTitle}>Pristupni podaci</Text>
        <Text style={credentialsText}>
          <strong>E-mail:</strong> {email}
          <br />
          <strong>Lozinka:</strong> {password}
        </Text>
      </Section>

      <Text style={emailStyles.textSmall}>
        Molimo vas da sačuvate ove podatke na sigurnom mjestu. Nakon prve prijave
        preporučujemo promjenu lozinke.
      </Text>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Link href={loginUrl} style={button}>
          Prijavi se
        </Link>
      </Section>

      <Hr style={emailStyles.hr} />

      <Text style={emailStyles.text}>
        Za sva pitanja slobodno nas kontaktirajte na{' '}
        <Link href="mailto:prijave@udruga-inovatic.hr" style={emailStyles.link}>
          prijave@udruga-inovatic.hr
        </Link>
        .
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
