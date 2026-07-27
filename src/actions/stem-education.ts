'use server'

import { headers } from 'next/headers'
import { sendStemEducationConfirmationEmail, sendStemEducationInquiryEmail } from '@/lib/email'
import { allowRequest } from '@/lib/rate-limit'
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
 *
 * Being public, unauthenticated and mail-triggering, it is also throttled: an
 * unchecked flood would bury the inbox that IS the record, and the confirmation
 * would double as an arbitrary-recipient mailer.
 */

/** Per hour. Generous for a school enquiring twice, useless for a flood. */
const MAX_PER_IP = 5
const MAX_PER_EMAIL = 3
const WINDOW_MS = 60 * 60 * 1000

/** First hop of `x-forwarded-for` (Railway sets it); unknown clients share a bucket. */
async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

export async function submitStemEducationInquiry(
  data: StemEducationInquiryFormData,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = stemEducationInquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const { contactName, institutionName, email, phone, institutionType, services, trainingPlace, message } =
    parsed.data

  // Honeypot — a real visitor never sees this field. Report success so a bot
  // learns nothing, but send nothing.
  if (parsed.data.website?.trim()) return { success: true }

  const ip = await clientIp()
  const normalizedEmail = email.trim().toLowerCase()
  // Two buckets: one address can't be flooded from many IPs, and one IP can't
  // cycle addresses. The limiter stores keys only in memory and logs nothing.
  if (
    !allowRequest(`stem:ip:${ip}`, MAX_PER_IP, WINDOW_MS) ||
    !allowRequest(`stem:email:${normalizedEmail}`, MAX_PER_EMAIL, WINDOW_MS)
  ) {
    return {
      success: false,
      error:
        'Primili smo previše upita s ove adrese. Pokušajte kasnije ili nam pišite na prijave@udruga-inovatic.hr.',
    }
  }

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
    // `false` means RESEND_API_KEY is unset. This form persists nothing, so the
    // notification IS the record — treat a non-send exactly like a throw rather
    // than telling the visitor their inquiry arrived when nothing was sent.
    if (!sent) {
      console.error('STEM education inquiry not delivered: RESEND_API_KEY is unset')
      return {
        success: false,
        error:
          'Greška pri slanju upita. Pokušajte ponovo ili nam pišite na prijave@udruga-inovatic.hr.',
      }
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
