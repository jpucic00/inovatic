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

interface PartyInquiryConfirmationProps {
  parentName: string
  /** Optional preferred date, pre-formatted as dd.MM.yyyy. */
  proposedDate?: string
}

export function PartyInquiryConfirmationEmail({
  parentName,
  proposedDate,
}: PartyInquiryConfirmationProps) {
  return (
    <Html>
      <Head />
      <Preview>Zaprimili smo vaš upit za proslavu rođendana – Inovatic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Hvala na upitu, {parentName}!</Heading>
          <Text style={text}>
            Zaprimili smo vaš upit za proslavu rođendana uz LEGO robotiku. 🎉
          </Text>
          {proposedDate && (
            <Text style={text}>
              Predloženi datum: <strong>{proposedDate}</strong>
            </Text>
          )}
          <Hr style={hr} />
          <Text style={text}>
            Naš tim će pregledati vaš upit i kontaktirati vas radi dogovora termina i
            detalja proslave u najkraćem mogućem roku.
          </Text>
          <Section>
            <Text style={text}>
              U međuvremenu, više o proslavama možete saznati na{' '}
              <Link href="https://udruga-inovatic.hr/proslave" style={link}>
                udruga-inovatic.hr/proslave
              </Link>
              .
            </Text>
          </Section>
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
