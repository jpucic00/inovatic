'use server'

import { sendStemEducationConfirmationEmail, sendStemEducationInquiryEmail } from '@/lib/email'
import {
  INSTITUTION_TYPE_LABELS,
  SERVICE_LABELS,
  TRAINING_PLACE_LABELS,
  stemEducationInquirySchema,
  type StemEducationInquiryFormData,
} from '@/lib/validators/stem-education'

/**
 * Public submission of the /stem-edukacija B2B inquiry form.
 *
 * Deliberately writes NOTHING to the database (owner decision 2026-07-25) —
 * these are one-off institutional inquiries handled straight from the inbox, so
 * the notification email is the record. That makes the notification the only
 * step whose failure the visitor must see: it is surfaced as an error, while a
 * failed courtesy confirmation is swallowed and logged.
 */
export async function submitStemEducationInquiry(
  data: StemEducationInquiryFormData,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = stemEducationInquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const { contactName, institutionName, email, phone, institutionType, services, trainingPlace, message } =
    parsed.data

  const serviceLabels = services.map((service) => SERVICE_LABELS[service])
  const trimmedPhone = phone?.trim()

  try {
    const sent = await sendStemEducationInquiryEmail({
      contactName,
      institutionName,
      institutionType: INSTITUTION_TYPE_LABELS[institutionType],
      email,
      phone: trimmedPhone || undefined,
      services: serviceLabels,
      trainingPlace: trainingPlace ? TRAINING_PLACE_LABELS[trainingPlace] : undefined,
      message,
    })
    // `false` means RESEND_API_KEY is unset — expected locally, but in
    // production it would silently drop the only copy of the inquiry.
    if (!sent) {
      console.error('STEM education inquiry not delivered: RESEND_API_KEY is unset')
    }
  } catch (err) {
    console.error('Failed to send STEM education inquiry notification:', err)
    return {
      success: false,
      error:
        'Greška pri slanju upita. Pokušajte ponovo ili nam pišite na prijave@udruga-inovatic.hr.',
    }
  }

  try {
    await sendStemEducationConfirmationEmail({
      to: email,
      contactName,
      institutionName,
      services: serviceLabels,
    })
  } catch (err) {
    console.error('Failed to send STEM education confirmation email:', err)
  }

  return { success: true }
}
