import { Text } from '@react-email/components'
import type { ReactNode } from 'react'

const labelStyle = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '700' as const,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  margin: '0 0 2px',
}

const valueStyle = {
  color: '#111827',
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0 0 14px',
  whiteSpace: 'pre-wrap' as const,
}

/**
 * One labelled line of an inbound-notification email. Shared by every form that
 * announces itself to the association inbox, so a submission reads the same
 * whichever form fired it.
 */
export function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{children}</Text>
    </>
  )
}
