import { Button, Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
import { Field } from './components/notification-field'
// `emails/` sits outside the `@/*` alias, so the label the admin badge renders
// is pulled in relatively — the inbox and the app must call this the same thing.
import { RETURNING_INQUIRY_LABEL } from '../src/lib/inquiry-status'

/**
 * The admin's derived "Ponovni upis" marker, as the notification carries it.
 * `OTHER_CITY` is the masked cross-city variant: it says only that a matching
 * child exists elsewhere, exactly as much as `/admin/upiti/[id]` reveals.
 */
export type ReturningMarker = 'SAME_CITY' | 'OTHER_CITY'

const RETURNING_COPY: Record<ReturningMarker, { title: string; body: string }> = {
  SAME_CITY: {
    title: `${RETURNING_INQUIRY_LABEL} — dijete je već u sustavu`,
    body: 'Prije upisa u novu grupu provjerite u koje je grupe dijete već upisano.',
  },
  OTHER_CITY: {
    title: `${RETURNING_INQUIRY_LABEL} — postojeći polaznik (druga lokacija)`,
    body: 'Dijete s ovim podacima već postoji u drugom gradu. Račun se ne preuzima automatski — obratite se vlasniku udruge.',
  },
}

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
  /**
   * The promised probni sat — its date, or a note that the termin is still to be
   * agreed. Present only when a free trial was actually granted, so its presence
   * is the signal that this family is owed a lesson before the upis. Mutually
   * exclusive with `returning` by construction: a trial is offered to
   * first-timers only.
   */
  trialLabel?: string
  /**
   * COURSE only — the child already exists as a student. Absent when this is a
   * first-time sign-up (and always on PARTY, which carries no child).
   */
  returning?: ReturningMarker
  /** PARTY only, already formatted dd.MM.yyyy. */
  partyProposedDate?: string
  message?: string
  referralSource?: string
  /** Absolute link to this upit in the admin. */
  adminUrl: string
}

// Violet callout mirroring the admin's own "Ponovni upis" panel (violet-50/200
// on violet-900/800), literal hex because mail clients have no Tailwind.
const returningBoxStyle = {
  backgroundColor: '#f5f3ff',
  border: '1px solid #ddd6fe',
  borderRadius: '8px',
  margin: '0 0 16px',
  padding: '12px 16px',
}

const returningTitleStyle = {
  color: '#4c1d95',
  fontSize: '14px',
  fontWeight: '700' as const,
  margin: '0 0 4px',
}

const returningTextStyle = {
  color: '#5b21b6',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
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
  trialLabel,
  returning,
  partyProposedDate,
  message,
  referralSource,
  adminUrl,
}: InquiryNotificationProps) {
  const isParty = kind === 'PARTY'
  const heading = isParty ? 'Novi upit za proslavu' : 'Novi upit za upis'
  const subject = isParty ? parentName : (childName ?? parentName)
  const returningCopy = returning ? RETURNING_COPY[returning] : null

  return (
    <EmailLayout
      // The marker rides in the preheader too: Outlook shows it beside the
      // subject, which is where a returning child gets spotted before anyone
      // opens the mail.
      preview={`${heading} – ${subject} (${cityLabel})${returning ? ` · ${RETURNING_INQUIRY_LABEL}` : ''}`}
      showSignature={false}
    >
      <Heading style={emailStyles.h1}>{heading}</Heading>
      <Text style={emailStyles.textSmall}>
        Zaprimljeno putem obrasca na udruga-inovatic.hr. Odgovorom na ovaj e-mail pišete
        izravno roditelju.
      </Text>
      {returningCopy && (
        <Section style={returningBoxStyle}>
          <Text style={returningTitleStyle}>{returningCopy.title}</Text>
          <Text style={returningTextStyle}>{returningCopy.body}</Text>
        </Section>
      )}
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

      {(programName ?? terminLabel ?? trialLabel ?? partyProposedDate) && (
        <>
          <Hr style={emailStyles.hr} />
          {programName && <Field label="Željeni program">{programName}</Field>}
          {terminLabel && <Field label="Željeni termin">{terminLabel}</Field>}
          {trialLabel && <Field label="Probni sat">{trialLabel}</Field>}
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
  returning: 'SAME_CITY',
  message: 'Marko je prošle godine završio SLR 1 i jako bi volio nastaviti.',
  referralSource: 'Preporuka prijateljice',
  adminUrl: 'https://udruga-inovatic.hr/admin/upiti/clx123',
} satisfies InquiryNotificationProps

export default InquiryNotificationEmail
