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

const courseLevelLabels: Record<string, string> = {
  SLR_1: 'Svijet LEGO Robotike 1 (6–8 god.)',
  SLR_2: 'Svijet LEGO Robotike 2 (9–10 god.)',
  SLR_3: 'Svijet LEGO Robotike 3 (11–12 god.)',
  SLR_4: 'Svijet LEGO Robotike 4 (13–14 god.)',
}

interface InquiryConfirmationProps {
  parentName: string
  childName: string
  childDateOfBirth: string
  courseLevelPref?: string
}

export function InquiryConfirmationEmail({
  parentName,
  childName,
  childDateOfBirth,
  courseLevelPref,
}: InquiryConfirmationProps) {
  const courseLabel = courseLevelPref ? courseLevelLabels[courseLevelPref] : undefined

  return (
    <Html>
      <Head />
      <Preview>Zaprimili smo vašu prijavu za {childName} – Inovatic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hvala na upitu, {parentName}!</Heading>
          <Text style={text}>
            Zaprimili smo vašu prijavu za upis djeteta <strong>{childName}</strong> (datum rođenja: {childDateOfBirth}) u program LEGO robotike.
          </Text>
          {courseLabel && (
            <Text style={text}>
              Navedena preferencija programa: <strong>{courseLabel}</strong>
            </Text>
          )}
          <Hr style={hr} />
          <Text style={text}>
            Naš tim će pregledati vašu prijavu i kontaktirati vas s dostupnim terminima i grupama u
            najkraćem mogućem roku.
          </Text>
          <Text style={text}>
            U međuvremenu, možete saznati više o našim programima na{' '}
            <Link href="https://udruga-inovatic.hr/programi" style={link}>
              udruga-inovatic.hr/programi
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
  fontWeight: '700',
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
