import { Heading, Hr, Link, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface StemEducationInquiryProps {
  contactName: string
  institutionName: string
  institutionType: string
  email: string
  phone?: string
  services: string[]
  trainingPlace?: string
  message: string
}

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

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{children}</Text>
    </>
  )
}

/**
 * Internal notification for a /stem-edukacija submission. Nothing about this
 * form is stored in the database, so this email IS the record — it must carry
 * every submitted field. Sent with reply-to set to the submitter.
 */
function StemEducationInquiryEmail({
  contactName,
  institutionName,
  institutionType,
  email,
  phone,
  services,
  trainingPlace,
  message,
}: StemEducationInquiryProps) {
  return (
    <EmailLayout
      preview={`Upit za STEM edukaciju – ${institutionName}`}
      showSignature={false}
    >
      <Heading style={emailStyles.h1}>Novi upit za STEM edukaciju</Heading>
      <Text style={emailStyles.textSmall}>
        Poslano putem obrasca na udruga-inovatic.hr/stem-edukacija. Upit nije pohranjen u
        aplikaciji — odgovorite izravno na ovaj email.
      </Text>
      <Hr style={emailStyles.hr} />

      <Field label="Kontakt osoba">{contactName}</Field>
      <Field label="Ustanova">
        {institutionName} ({institutionType})
      </Field>
      <Field label="Email">
        <Link href={`mailto:${email}`} style={emailStyles.link}>
          {email}
        </Link>
      </Field>
      {phone && (
        <Field label="Telefon">
          <Link href={`tel:${phone.replace(/\s/g, '')}`} style={emailStyles.link}>
            {phone}
          </Link>
        </Field>
      )}
      <Field label="Tražene usluge">{services.join(' · ')}</Field>
      {trainingPlace && <Field label="Mjesto održavanja">{trainingPlace}</Field>}

      <Hr style={emailStyles.hr} />
      <Field label="Opis potreba">{message}</Field>
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`).
StemEducationInquiryEmail.PreviewProps = {
  contactName: 'Ivana Ivić',
  institutionName: 'OŠ Meje',
  institutionType: 'Osnovna škola',
  email: 'ivana.ivic@skole.hr',
  phone: '091 234 5678',
  services: ['Osnovna edukacija mentora', 'Pomoć pri odabiru STEM opreme'],
  trainingPlace: 'U našoj školi ili ustanovi',
  message:
    'Nabavili smo šest LEGO SPIKE setova, ali ih nitko od učitelja ne koristi.\nTrebamo edukaciju za tri učiteljice i prijedlog godišnjeg programa izvannastavne aktivnosti.',
} satisfies StemEducationInquiryProps

export default StemEducationInquiryEmail
