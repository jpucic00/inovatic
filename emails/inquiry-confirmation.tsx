import { Heading, Hr, Link, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

const courseLevelLabels: Record<string, string> = {
  SLR_1: 'Svijet LEGO Robotike 1 (6–8 god.)',
  SLR_2: 'Svijet LEGO Robotike 2 (9–10 god.)',
  SLR_3: 'Svijet LEGO Robotike 3 (11–12 god.)',
  SLR_4: 'Svijet LEGO Robotike 4 (13–14 god.)',
}

interface InquiryConfirmationProps {
  parentName: string
  childName: string
  childDateOfBirth: string
  cityLabel?: string
  courseLevelPref?: string
}

function InquiryConfirmationEmail({
  parentName,
  childName,
  childDateOfBirth,
  cityLabel,
  courseLevelPref,
}: InquiryConfirmationProps) {
  const courseLabel = courseLevelPref ? courseLevelLabels[courseLevelPref] : undefined

  return (
    <EmailLayout preview={`Zaprimili smo vašu prijavu za ${childName} – Inovatic`}>
      <Heading style={emailStyles.h1}>Hvala na upitu, {parentName}!</Heading>
      <Text style={emailStyles.text}>
        Zaprimili smo vašu prijavu za upis djeteta <strong>{childName}</strong> (datum
        rođenja: {childDateOfBirth}) u program LEGO robotike.
      </Text>
      {cityLabel && (
        <Text style={emailStyles.text}>
          Odabrani grad: <strong>{cityLabel}</strong>
        </Text>
      )}
      {courseLabel && (
        <Text style={emailStyles.text}>
          Navedena preferencija programa: <strong>{courseLabel}</strong>
        </Text>
      )}
      <Hr style={emailStyles.hr} />
      <Text style={emailStyles.text}>
        Naš tim će pregledati vašu prijavu i kontaktirati vas s dostupnim terminima i
        grupama u najkraćem mogućem roku.
      </Text>
      <Text style={emailStyles.text}>
        U međuvremenu, možete saznati više o našim programima na{' '}
        <Link href="https://udruga-inovatic.hr/programi" style={emailStyles.link}>
          udruga-inovatic.hr/programi
        </Link>
        .
      </Text>
    </EmailLayout>
  )
}

// Sample data for the `react-email` preview server (`npm run email`) — shows the
// optional city + course-preference lines populated.
InquiryConfirmationEmail.PreviewProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  cityLabel: 'Šibenik',
  courseLevelPref: 'SLR_2',
} satisfies InquiryConfirmationProps

export default InquiryConfirmationEmail
