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

interface GroupOption {
  groupName: string
  dayOfWeek: string
  startTime: string
  endTime: string
  locationName: string
}

interface ScheduleOptionsProps {
  parentName: string
  childName: string
  options: GroupOption[]
}

export function ScheduleOptionsEmail({
  parentName,
  childName,
  options,
}: ScheduleOptionsProps) {
  return (
    <Html>
      <Head />
      <Preview>Dostupni termini za {childName} – Inovatic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Poštovani/a {parentName},</Heading>
          <Text style={text}>
            Zahvaljujemo na prijavi za upis djeteta <strong>{childName}</strong> u
            program LEGO robotike. Pregledali smo vašu prijavu i pripremili
            dostupne termine.
          </Text>
          <Hr style={hr} />
          <Text style={text}>
            <strong>Dostupni termini:</strong>
          </Text>
          {options.map((opt, i) => (
            <Section key={i} style={optionBox}>
              <Text style={optionText}>
                <strong>{opt.groupName}</strong>
                <br />
                {opt.dayOfWeek}, {opt.startTime}–{opt.endTime}
                <br />
                📍 {opt.locationName}
              </Text>
            </Section>
          ))}
          <Hr style={hr} />
          <Text style={text}>
            Molimo vas da nam odgovorite na ovaj e-mail s preferiranim terminom
            kako bismo mogli dovršiti upis vašeg djeteta.
          </Text>
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

const optionBox = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 8px',
}

const optionText = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
}
