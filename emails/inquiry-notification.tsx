import { Button, Heading, Hr, Link, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
import { Field } from './components/notification-field'

interface InquiryNotificationProps {
  /** Which public form fired this — decides the heading and which fields exist. */
  kind: 'COURSE' | 'PARTY'
  cityLabel: string
  parentName: string
  parentEmail: string
  parentPhone: string
  /** COURSE only. */
  childName?: string
  /** COURSE only, already formatted dd.MM.yyyy. */
  childDateOfBirth?: string
  childSchool?: string
  gradeLabel?: string
  programName?: string
  /**
   * The booked group's one-line description, or — on the competitive program —
   * the parent's "ne odgovara mi predloženi termin" answer. Absent when no
   * termin was on the table.
   */
  terminLabel?: string
  /** PARTY only, already formatted dd.MM.yyyy. */
  partyProposedDate?: string
  message?: string
  referralSource?: string
  /** Absolute link to this upit in the admin. */
  adminUrl: string
}

const buttonStyle = {
  backgroundColor: '#0891b2',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600' as const,
  padding: '12px 22px',
  textDecoration: 'none',
}

/**
 * Internal notification for a public sign-up. Unlike the /stem-edukacija
 * notification this is NOT the record — the upit is already stored and linked
 * below — but it carries every submitted field anyway, so the team can triage
 * from the inbox without opening the admin.
 *
 * Sent with reply-to set to the parent: hitting Reply in Outlook answers the
 * family directly, which is the whole point of announcing the upit by e-mail.
 */
function InquiryNotificationEmail({
  kind,
  cityLabel,
  parentName,
  parentEmail,
  parentPhone,
  childName,
  childDateOfBirth,
  childSchool,
  gradeLabel,
  programName,
  terminLabel,
  partyProposedDate,
  message,
  referralSource,
  adminUrl,
}: InquiryNotificationProps) {
  const isParty = kind === 'PARTY'
  const heading = isParty ? 'Novi upit za proslavu' : 'Novi upit za upis'
  const subject = isParty ? parentName : (childName ?? parentName)

  return (
    <EmailLayout preview={`${heading} – ${subject} (${cityLabel})`} showSignature={false}>
      <Heading style={emailStyles.h1}>{heading}</Heading>
      <Text style={emailStyles.textSmall}>
        Zaprimljeno putem obrasca na udruga-inovatic.hr. Odgovorom na ovaj e-mail pišete
        izravno roditelju.
      </Text>
      <Hr style={emailStyles.hr} />

      <Field label="Grad">{cityLabel}</Field>
      <Field label="Roditelj">{parentName}</Field>
      <Field label="Email">
        <Link href={`mailto:${parentEmail}`} style={emailStyles.link}>
          {parentEmail}
        </Link>
      </Field>
      <Field label="Telefon">
        <Link href={`tel:${parentPhone.replace(/\s/g, '')}`} style={emailStyles.link}>
          {parentPhone}
        </Link>
      </Field>

      {childName && (
        <>
          <Hr style={emailStyles.hr} />
          <Field label="Dijete">{childName}</Field>
          {childDateOfBirth && <Field label="Datum rođenja">{childDateOfBirth}</Field>}
          {gradeLabel && <Field label="Razred">{gradeLabel}</Field>}
          {childSchool && <Field label="Škola">{childSchool}</Field>}
        </>
      )}

      {(programName ?? terminLabel ?? partyProposedDate) && (
        <>
          <Hr style={emailStyles.hr} />
          {programName && <Field label="Željeni program">{programName}</Field>}
          {terminLabel && <Field label="Željeni termin">{terminLabel}</Field>}
          {partyProposedDate && <Field label="Željeni datum">{partyProposedDate}</Field>}
        </>
      )}

      <Hr style={emailStyles.hr} />
      {message && <Field label="Poruka">{message}</Field>}
      {referralSource && <Field label="Izvor saznanja">{referralSource}</Field>}

      <Button href={adminUrl} style={buttonStyle}>
        Otvori upit u aplikaciji
      </Button>
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`).
InquiryNotificationEmail.PreviewProps = {
  kind: 'COURSE',
  cityLabel: 'Šibenik',
  parentName: 'Ana Anić',
  parentEmail: 'ana.anic@example.hr',
  parentPhone: '091 234 5678',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  childSchool: 'OŠ Petra Krešimira IV.',
  gradeLabel: '3. razred',
  programName: 'Svijet LEGO robotike 2',
  terminLabel: 'SLR 2 · Utorak · 17:00–18:30 · Trokut inkubator',
  message: 'Marko je prošle godine završio SLR 1 i jako bi volio nastaviti.',
  referralSource: 'Preporuka prijateljice',
  adminUrl: 'https://udruga-inovatic.hr/admin/upiti/clx123',
} satisfies InquiryNotificationProps

export default InquiryNotificationEmail
