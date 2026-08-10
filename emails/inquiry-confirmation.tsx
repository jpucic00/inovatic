import { Heading, Hr, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'
// Relative — `emails/` sits outside the `@/*` alias. Shared with the form's
// success screen so the two can never disagree about what happens next.
import {
  INQUIRY_NEXT_STEP_TEXT,
  type InquiryNextStep,
} from '../src/lib/inquiry-next-step'
import type { RadionicaPaymentPlan } from '../src/lib/radionica-deposit'

interface InquiryConfirmationProps {
  parentName: string
  childName: string
  childDateOfBirth: string
  cityLabel?: string
  /** Defaults to the offer-them-termini wording — the pre-dropdown behaviour. */
  nextStep?: InquiryNextStep
  /**
   * The akontacija + ostatak figures for a radionica (see
   * `radionicaPaymentPlan`). Set on radionica sign-ups with a price and on
   * nothing else — SLR and natjecateljski confirmations carry no payment
   * instruction, and a free radionica must not either, so its absence removes
   * the whole NAPOMENA block rather than zeroing the amounts inside it.
   */
  payment?: RadionicaPaymentPlan
}

function InquiryConfirmationEmail({
  parentName,
  childName,
  childDateOfBirth,
  cityLabel,
  nextStep = 'TERMIN_TO_OFFER',
  payment,
}: InquiryConfirmationProps) {
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
      <Hr style={emailStyles.hr} />
      {payment && (
        <>
          <Text style={napomenaHeading}>NAPOMENA I UPUTE ZA PLAĆANJE</Text>
          <Text style={emailStyles.text}>
            <strong>Akontacija:</strong> Kako bi potvrdili svoju prijavu, u roku od 3 dana
            molimo da uplatite akontaciju u iznosu od{' '}
            <strong>{`${payment.deposit} eura`}</strong> po djetetu za odabrani ciklus.
          </Text>
          <Text style={emailStyles.text}>
            <strong>Ostatak uplate:</strong> Ostatak novca potrebno je uplatiti najkasnije
            3 dana prije početka odabranog ciklusa.
          </Text>

          <Text style={paymentBoxHeading}>
            {`Podaci za uplatu akontacije (${payment.deposit} EUR):`}
          </Text>
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
              <strong>Iznos:</strong> {`${payment.deposit} EUR`}
              <br />
              {/* Radionice are admin-created with free-text names, so this stays
                  generic — never the workshop's own title. */}
              <strong>Opis plaćanja:</strong> Rezervacija za radionicu na ime i prezime
              djeteta
            </Text>
          </Section>

          <Text style={paymentBoxHeading}>Podaci za uplatu ostatka iznosa:</Text>
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
              <strong>Opis plaćanja:</strong> Ostatak uplate za radionicu na ime i prezime
              djeteta
            </Text>
            <Text style={paymentAmountLabel}>Iznos:</Text>
            <Text style={paymentText}>
              • <strong>Redovni ostatak:</strong>{' '}
              {`${payment.remainder} EUR (ukupno ${payment.total} EUR)`}
              {payment.discountedRemainder && payment.discountedTotal && (
                <>
                  <br />• <strong>Ostatak s popustom</strong>
                  {` (drugo dijete / dijete polaznik cjelogodišnjeg programa): ${payment.discountedRemainder} EUR (ukupno ${payment.discountedTotal} EUR)`}
                </>
              )}
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

// Names the box that follows it, so the two payments can never be confused for
// one another — the akontacija and the ostatak share an IBAN and a model, and
// only the amount and the description tell them apart.
const paymentBoxHeading = {
  ...emailStyles.text,
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

// The ostatak has two possible amounts, so its "Iznos:" label heads a short
// list instead of sitting inline like every other field.
const paymentAmountLabel = {
  ...paymentText,
  fontWeight: '700' as const,
  margin: '8px 0 0',
}

// Sample data for the `react-email` preview server (`npm run email`) — a
// radionica sign-up with a booked termin, so both the payment block (a 150 €
// ciklus) and the chosen-termin wording show. Drop `payment` or switch
// `nextStep` in the preview's Props panel to see the other variants.
InquiryConfirmationEmail.PreviewProps = {
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
  cityLabel: 'Šibenik',
  nextStep: 'TERMIN_CHOSEN',
  payment: {
    deposit: '30,00',
    remainder: '120,00',
    total: '150,00',
    discountedRemainder: '100,00',
    discountedTotal: '130,00',
  },
} satisfies InquiryConfirmationProps

export default InquiryConfirmationEmail
