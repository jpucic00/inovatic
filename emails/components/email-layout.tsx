import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

// The apex domain still serves the old WordPress site, so the new app's public
// assets aren't reachable there — the logo is hosted on the project's Cloudinary
// CDN (same host as every other image). `w_280` = 2× the 140px display width.
const LOGO_URL =
  'https://res.cloudinary.com/dgc2tp4f8/image/upload/w_280/branding/inovatic-logo.png'

export const emailStyles = {
  main: {
    backgroundColor: '#f8fafc',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    margin: '0 auto',
    padding: '40px 24px',
    maxWidth: '560px',
  },
  header: {
    textAlign: 'center' as const,
    margin: '0 0 24px',
  },
  h1: {
    color: '#0891b2',
    fontSize: '24px',
    fontWeight: '700' as const,
    margin: '0 0 24px',
  },
  text: {
    color: '#374151',
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  textSmall: {
    color: '#6b7280',
    fontSize: '13px',
    lineHeight: '1.5',
    margin: '0 0 16px',
  },
  hr: {
    borderColor: '#e5e7eb',
    margin: '24px 0',
  },
  link: {
    color: '#0891b2',
  },
  footer: {
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0',
  },
}

interface EmailLayoutProps {
  preview: string
  children: ReactNode
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.header}>
            <Link href="https://udruga-inovatic.hr">
              <Img
                src={LOGO_URL}
                alt="Inovatic – Udruga za robotiku"
                width={140}
                height={80}
              />
            </Link>
          </Section>
          {children}
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            S poštovanjem,
            <br />
            <strong>Tim Inovatic</strong>
            <br />
            Udruga za robotiku &quot;Inovatic&quot;
          </Text>
          <Text style={emailStyles.footer}>
            <strong>Kontakt Split</strong>
            <br />
            <Link href="mailto:upisi@udruga-inovatic.hr" style={emailStyles.link}>
              upisi@udruga-inovatic.hr
            </Link>
            {' · '}
            <Link href="tel:+385993936993" style={emailStyles.link}>
              +385 99 393 6993
            </Link>
            <br />
            <br />
            <strong>Kontakt Šibenik</strong>
            <br />
            <Link href="mailto:upisi.sibenik@udruga-inovatic.hr" style={emailStyles.link}>
              upisi.sibenik@udruga-inovatic.hr
            </Link>
            {' · '}
            <Link href="tel:+385921689987" style={emailStyles.link}>
              +385 92 168 9987
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
