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

// Full-bleed contact band at the very bottom, styled off the website's own
// footer so the two read as one brand: `bg-gray-900` (Tailwind v4
// `oklch(21% 0.034 264.665)` = #101828), a white section heading, and
// `text-gray-400` (#99a1af) contact lines. Sits OUTSIDE the body container on
// purpose — a website footer spans the full width, it is not a card.
const contactFooter = {
  backgroundColor: '#101828',
  margin: '0',
}

const contactFooterInner = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px 24px',
}

const contactCity = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  margin: '0 0 10px',
}

const contactCitySecond = {
  ...contactCity,
  margin: '24px 0 10px',
}

const contactLine = {
  color: '#99a1af',
  fontSize: '14px',
  lineHeight: '1.7',
  margin: '0',
}

const contactLink = {
  color: '#99a1af',
  textDecoration: 'none',
}

interface EmailLayoutProps {
  preview: string
  children: ReactNode
  /**
   * Sign-off + contact block. Off for internal notifications (an email TO the
   * association should not close with the association's own contact card).
   */
  showSignature?: boolean
}

export function EmailLayout({ preview, children, showSignature = true }: EmailLayoutProps) {
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
          {showSignature && (
            <>
              <Hr style={emailStyles.hr} />
              <Text style={emailStyles.footer}>
                S poštovanjem,
                <br />
                <strong>Tim Inovatic</strong>
                <br />
                Udruga za robotiku &quot;Inovatic&quot;
              </Text>
            </>
          )}
        </Container>
        {showSignature && (
          <Section style={contactFooter}>
            <Container style={contactFooterInner}>
              <Text style={contactCity}>Kontakt Split</Text>
              <Text style={contactLine}>
                <Link href="mailto:prijave@udruga-inovatic.hr" style={contactLink}>
                  prijave@udruga-inovatic.hr
                </Link>
                <br />
                <Link href="tel:+385993936993" style={contactLink}>
                  +385 99 393 6993
                </Link>
              </Text>
              <Text style={contactCitySecond}>Kontakt Šibenik</Text>
              <Text style={contactLine}>
                <Link href="mailto:prijave.sibenik@udruga-inovatic.hr" style={contactLink}>
                  prijave.sibenik@udruga-inovatic.hr
                </Link>
                <br />
                <Link href="tel:+385921689987" style={contactLink}>
                  +385 92 168 9987
                </Link>
              </Text>
            </Container>
          </Section>
        )}
      </Body>
    </Html>
  )
}
