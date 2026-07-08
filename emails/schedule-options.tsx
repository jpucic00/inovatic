import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface GroupOption {
  groupName: string
  /** Pre-formatted schedule string, e.g. "Ponedjeljak, 17:00–18:30" for standard
   * programs or "15.07.2026. – 21.07.2026., 09:00–11:00" for radionice. */
  schedule: string
  locationName: string
}

interface ScheduleOptionsProps {
  parentName: string
  childName: string
  options: GroupOption[]
}

export function ScheduleOptionsEmail({
  parentName,
  childName,
  options,
}: ScheduleOptionsProps) {
  return (
    <EmailLayout preview={`Dostupni termini za ${childName} – Inovatic`}>
      <Heading style={emailStyles.h1}>Poštovani/a {parentName},</Heading>
      <Text style={emailStyles.text}>
        Zahvaljujemo na prijavi za upis djeteta <strong>{childName}</strong> u program
        LEGO robotike. Pregledali smo vašu prijavu i pripremili dostupne termine.
      </Text>
      <Hr style={emailStyles.hr} />
      <Text style={emailStyles.text}>
        <strong>Dostupni termini:</strong>
      </Text>
      {options.map((opt, i) => (
        <Section key={i} style={optionBox}>
          <Text style={optionText}>
            <strong>{opt.groupName}</strong>
            <br />
            {opt.schedule}
            <br />
            📍 {opt.locationName}
          </Text>
        </Section>
      ))}
      <Hr style={emailStyles.hr} />
      <Text style={emailStyles.text}>
        Molimo vas da nam odgovorite na ovaj e-mail s preferiranim terminom kako bismo
        mogli dovršiti upis vašeg djeteta.
      </Text>
      <Text style={emailStyles.text}>
        Za sva pitanja slobodno nas kontaktirajte na{' '}
        <Link href="mailto:prijave@udruga-inovatic.hr" style={emailStyles.link}>
          prijave@udruga-inovatic.hr
        </Link>{' '}
        ili na <Link href="tel:+385993936993" style={emailStyles.link}>+385 99 393 6993</Link>.
      </Text>
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
