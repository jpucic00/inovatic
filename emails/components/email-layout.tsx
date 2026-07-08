import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

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
          {children}
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
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
