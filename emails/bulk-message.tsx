import { Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
import type { GroupOption } from './schedule-options'

interface BulkMessageProps {
  /** Admin-authored plain text; newline-separated paragraphs. Sent exactly as
   * written — no auto-prepended greeting (parent names are missing on many
   * imported previous-year students, so the admin writes their own salutation). */
  bodyText: string
  /** When present, renders the schedule boxes ("Termini u novoj školskoj godini"). */
  options?: GroupOption[]
  /** When present, renders the centered "Ispunite prijavu" CTA button. */
  signupUrl?: string
  /** Admin-authored subject — reused as the inbox preview line. */
  subject: string
}

/**
 * One template for every /admin/email campaign kind: a CUSTOM send passes only
 * bodyText; the REENROLLMENT invitation adds `options` + `signupUrl`.
 */
function BulkMessageEmail({ bodyText, options, signupUrl, subject }: BulkMessageProps) {
  const paragraphs = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <EmailLayout preview={subject}>
      {paragraphs.map((paragraph, i) => (
        <Text key={i} style={emailStyles.text}>
          {paragraph}
        </Text>
      ))}
      {options && options.length > 0 && (
        <>
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.text}>
            <strong>Termini u novoj školskoj godini:</strong>
          </Text>
          {options.map((opt, i) => (
            <Section key={i} style={optionBox}>
              <Text style={optionText}>
                <strong>{opt.groupName}</strong>
                <br />
                {opt.schedule}
                <br />
                📍 {opt.locationName}
                <br />
                <span style={locationAddress}>{opt.locationAddress}</span>
              </Text>
            </Section>
          ))}
        </>
      )}
      {signupUrl && (
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Link href={signupUrl} style={button}>
            Ispunite prijavu
          </Link>
        </Section>
      )}
      {/* No contact paragraph here on purpose: it hardcoded the Split inbox,
          which is wrong for a Šibenik campaign, and EmailLayout's footer
          already lists both cities' contacts. */}
    </EmailLayout>
  )
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

const locationAddress = {
  color: '#6b7280',
  fontSize: '13px',
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

// Sample data for the `react-email` preview server (`npm run email`) — the full
// REENROLLMENT variant so both conditional sections render.
BulkMessageEmail.PreviewProps = {
  subject: 'Upisi u školsku godinu 2026/2027 – Inovatic',
  bodyText:
    'Poštovani,\n' +
    'Vaše je dijete prošle školske godine pohađalo program LEGO robotike u našoj udruzi i nadamo se da ćemo se družiti i ove godine.\n' +
    'Upisi u novu školsku godinu su otvoreni. U nastavku se nalaze termini grupa — prijavu ispunite putem poveznice na dnu ove poruke, a mi ćemo vam se javiti s potvrdom termina.\n' +
    'Broj mjesta po grupi je ograničen, stoga preporučujemo što raniju prijavu.',
  options: [
    {
      groupName: 'SLR 2 – utorkom',
      schedule: 'Utorak, 17:00–18:30',
      locationName: 'OŠ Meje',
      locationAddress: 'Prilaz braće Kaliterna 10, 21000 Split',
    },
    {
      groupName: 'SLR 2 – četvrtkom',
      schedule: 'Četvrtak, 18:30–20:00',
      locationName: 'Velebitska 32',
      locationAddress: 'Velebitska 32, 21000 Split',
    },
  ],
  signupUrl: 'https://udruga-inovatic.hr/upisi',
} satisfies BulkMessageProps

export default BulkMessageEmail
