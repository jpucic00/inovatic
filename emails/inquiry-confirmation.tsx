import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
// Relative — `emails/` sits outside the `@/*` alias. Shared with the form's
// success screen so the two can never disagree about what happens next.
import {
  INQUIRY_NEXT_STEP_TEXT,
  type InquiryNextStep,
} from '../src/lib/inquiry-next-step'

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
  /** Defaults to the offer-them-termini wording — the pre-dropdown behaviour. */
  nextStep?: InquiryNextStep
  /**
   * Croatian money copy for the radionica booking deposit, e.g. "30,00 eura"
   * (see `radionicaDepositAmount`). Set on radionica sign-ups with a price and
   * on nothing else — SLR and natjecateljski confirmations carry no payment
   * instruction, and a free radionica must not either, so its absence removes
   * the whole NAPOMENA block rather than zeroing the amount inside it.
   */
  depositAmount?: string
}

function InquiryConfirmationEmail({
  parentName,
  childName,
  childDateOfBirth,
  cityLabel,
  courseLevelPref,
  nextStep = 'TERMIN_TO_OFFER',
  depositAmount,
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
      {depositAmount && (
        <>
          <Text style={napomenaHeading}>NAPOMENA:</Text>
          <Text style={emailStyles.text}>
            Kako bi potvrdili svoju prijavu u roku od 3 dana molimo da uplatite akontaciju
            u iznosu od <strong>{depositAmount}</strong> po djetetu za odabrani ciklus.
          </Text>
          <Text style={emailStyles.text}>Uplatu izvršiti na sljedeći način:</Text>
          <Section style={paymentBox}>
            <Text style={paymentText}>
              <strong>Primatelj:</strong> UDRUGA ZA ROBOTIKU &quot;INOVATIC&quot;
              <br />
              <strong>IBAN:</strong> HR7223400091110811408
              <br />
              <strong>Model:</strong> 00
              <br />
              <strong>Poziv na broj:</strong> datum uplate (DDMMGGG)
              <br />
              <strong>Opis plaćanja:</strong> Rezervacija za radionicu na ime i prezime
              djeteta.
            </Text>
          </Section>
          <Text style={emailStyles.textSmall}>
            *u slučaju ne izvršenja uplate akontacije u roku 3 radna dana prijava se
            automatski <strong>BRIŠE</strong>.
            <br />
            *u slučaju odustajanja ne vraćamo uplaćenu akontaciju.
          </Text>
          <Hr style={emailStyles.hr} />
        </>
      )}
      <Text style={emailStyles.text}>{INQUIRY_NEXT_STEP_TEXT[nextStep]}</Text>
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

const napomenaHeading = {
  ...emailStyles.text,
  color: '#92400e',
  fontWeight: '700' as const,
  margin: '0 0 8px',
}

// Amber rather than the teal/emerald of the informational boxes elsewhere: this
// one is an action with a 3-day deadline attached, not a detail to file away.
const paymentBox = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '0 0 16px',
}

const paymentText = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '1.8',
  margin: '0',
}

// Sample data for the `react-email` preview server (`npm run email`) — a
// radionica sign-up with a booked termin, so both the deposit block (a 150 €
// ciklus → 30,00 eura) and the chosen-termin wording show. Drop `depositAmount`
// or switch `nextStep` in the preview's Props panel to see the other variants.
InquiryConfirmationEmail.PreviewProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  cityLabel: 'Šibenik',
  courseLevelPref: 'SLR_2',
  nextStep: 'TERMIN_CHOSEN',
  depositAmount: '30,00 eura',
} satisfies InquiryConfirmationProps

export default InquiryConfirmationEmail
