import { createElement } from 'react'
import { render } from '@react-email/components'
import type { City } from '@prisma/client'
import type { EvaluationCard } from '@/lib/evaluation-email-cards'
import { ASSOCIATION_EMAIL, cityInboxEmail, sendTransactionalEmail } from './client'
import type { InquiryNextStep } from '@/lib/inquiry-next-step'
import type { RadionicaPaymentPlan } from '@/lib/radionica-deposit'
import { CITY_LABELS } from '@/lib/city'
import InquiryConfirmationEmail from '../../../emails/inquiry-confirmation'
import InquiryNotificationEmail from '../../../emails/inquiry-notification'
import PartyInquiryConfirmationEmail from '../../../emails/party-inquiry-confirmation'
import StemEducationInquiryEmail from '../../../emails/stem-education-inquiry'
import StemEducationConfirmationEmail from '../../../emails/stem-education-confirmation'
import ScheduleOptionsEmail, { type GroupOption } from '../../../emails/schedule-options'
import AccountCredentialsEmail from '../../../emails/account-credentials'
import TeacherCredentialsEmail from '../../../emails/teacher-credentials'
import BulkMessageEmail from '../../../emails/bulk-message'

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'https://udruga-inovatic.hr'
  )
}

/**
 * Typed senders — one per transactional email. Each owns its subject and maps
 * caller-supplied primitives onto the matching React Email template, then hands
 * off to {@link sendTransactionalEmail} (which applies the RESEND_API_KEY gate,
 * the `from`/`replyTo` identity, and returns `false` when unsent).
 *
 * A sender whose email belongs to a tenant takes `city` and passes it down —
 * that is what puts the city's own enrollment address in the From line, so a
 * Šibenik family never sees or replies to Split. It is REQUIRED wherever a city
 * exists (never defaulted), for the same reason the city columns have no
 * `@default`: forgetting one must be a tsc error, not a silent Split stamp.
 *
 * Callers keep their own error policy — the senders never swallow.
 */

/** Public course-inquiry confirmation → the parent who submitted the form. */
export function sendInquiryConfirmationEmail(params: {
  to: string
  /** Sends from — and labels the body with — this city's enrollment inbox. */
  city: City
  parentName: string
  childName: string
  childDateOfBirth: string
  /** Which "what happens next" paragraph closes the body. */
  nextStep?: InquiryNextStep
  /**
   * Already-formatted akontacija + ostatak figures, which add the payment
   * instruction to the body. Radionica sign-ups only — the caller decides,
   * since only it knows which program the inquiry landed on.
   */
  payment?: RadionicaPaymentPlan
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    city: params.city,
    subject: 'Zaprimili smo vašu prijavu – Inovatic',
    react: createElement(InquiryConfirmationEmail, {
      parentName: params.parentName,
      childName: params.childName,
      childDateOfBirth: params.childDateOfBirth,
      // Derived rather than taken as a second parameter: the grad named in the
      // body and the office in the From line are the same fact.
      cityLabel: CITY_LABELS[params.city],
      nextStep: params.nextStep,
      payment: params.payment,
    }),
  })
}

/**
 * Public party (proslava) confirmation → the parent who submitted the form.
 * Proslave are Split-only (owner decision), so this one carries no city and
 * sends from the association address.
 */
export function sendPartyInquiryConfirmationEmail(params: {
  to: string
  parentName: string
  proposedDate?: string
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    subject: 'Zaprimili smo vaš upit za proslavu – Inovatic',
    react: createElement(PartyInquiryConfirmationEmail, {
      parentName: params.parentName,
      proposedDate: params.proposedDate,
    }),
  })
}

/** The upit's own row in the admin — the notification's "act on it" link. */
const adminInquiryUrl = (inquiryId: string) => `${publicBaseUrl()}/admin/upiti/${inquiryId}`

/**
 * Public course inquiry → the enrollment inbox of the city it was filed under,
 * so Šibenik's upiti never land in Split's inbox and vice versa. That same inbox
 * is the From address, which is what keeps the announcement inside one office's
 * own mail thread.
 *
 * The upit is already stored, so unlike the /stem-edukacija notification this
 * is not the record — but reply-to is the parent, which lets staff answer the
 * family straight from Outlook instead of opening the admin first.
 */
export function sendInquiryNotificationEmail(params: {
  inquiryId: string
  city: City
  parentName: string
  parentEmail: string
  parentPhone: string
  childName: string
  /** Already formatted dd.MM.yyyy. */
  childDateOfBirth: string
  childSchool?: string
  gradeLabel?: string
  programName?: string
  /** Booked group, or the competitive program's "nijedan termin ne odgovara". */
  terminLabel?: string
  message?: string
  referralSource?: string
}): Promise<boolean> {
  const { inquiryId, city, ...fields } = params
  const cityLabel = CITY_LABELS[city]
  return sendTransactionalEmail({
    to: cityInboxEmail(city),
    city,
    replyTo: params.parentEmail,
    subject: `Novi upit za upis: ${params.childName} – ${cityLabel}`,
    react: createElement(InquiryNotificationEmail, {
      ...fields,
      kind: 'COURSE',
      cityLabel,
      adminUrl: adminInquiryUrl(inquiryId),
    }),
  })
}

/**
 * Public /proslave inquiry → the association inbox. Proslave are Split-only
 * (owner decision), so there is no city to route on here.
 */
export function sendPartyInquiryNotificationEmail(params: {
  inquiryId: string
  parentName: string
  parentEmail: string
  parentPhone: string
  message: string
  /** Already formatted dd.MM.yyyy. */
  partyProposedDate?: string
}): Promise<boolean> {
  const { inquiryId, ...fields } = params
  return sendTransactionalEmail({
    to: ASSOCIATION_EMAIL,
    replyTo: params.parentEmail,
    subject: `Novi upit za proslavu: ${params.parentName}`,
    react: createElement(InquiryNotificationEmail, {
      ...fields,
      kind: 'PARTY',
      cityLabel: CITY_LABELS.SPLIT,
      adminUrl: adminInquiryUrl(inquiryId),
    }),
  })
}

type StemEducationInquiryParams = {
  contactName: string
  institutionName: string
  institutionType: string
  email: string
  phone?: string
  /** Croatian service labels, already resolved from the submitted enum keys. */
  services: string[]
  trainingPlace?: string
  message: string
}

/**
 * Public /stem-edukacija submission → the association inbox. These inquiries
 * are deliberately not persisted, so this email is the only record; reply-to is
 * the submitter so staff answer them straight from the inbox.
 */
export function sendStemEducationInquiryEmail(
  params: StemEducationInquiryParams,
): Promise<boolean> {
  return sendTransactionalEmail({
    to: ASSOCIATION_EMAIL,
    replyTo: params.email,
    subject: `Upit za STEM edukaciju – ${params.institutionName}`,
    react: createElement(StemEducationInquiryEmail, params),
  })
}

/** Public /stem-edukacija confirmation → the person who submitted the form. */
export function sendStemEducationConfirmationEmail(params: {
  to: string
  contactName: string
  institutionName: string
  services: string[]
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    subject: 'Zaprimili smo vaš upit za STEM edukaciju – Inovatic',
    react: createElement(StemEducationConfirmationEmail, {
      contactName: params.contactName,
      institutionName: params.institutionName,
      services: params.services,
    }),
  })
}

/**
 * Admin-picked schedule options → the inquiry's parent (this one invites a
 * reply, so the city that offered the termini must be the city that gets it).
 */
export function sendScheduleOptionsEmail(params: {
  to: string
  /** The inquiry's own city — the office offering these termini. */
  city: City
  parentName: string
  childName: string
  options: GroupOption[]
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    city: params.city,
    subject: `Dostupni termini za ${params.childName} – Inovatic`,
    react: createElement(ScheduleOptionsEmail, {
      parentName: params.parentName,
      childName: params.childName,
      options: params.options,
    }),
  })
}

/** Student account credentials + enrollment details → the student's parent. */
export function sendStudentCredentialsEmail(params: {
  to: string
  /** The city the child was enrolled in. */
  city: City
  parentName: string
  childName: string
  username: string
  password: string
  groupName: string
  schedule: string
  locationName: string
  locationAddress: string
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    city: params.city,
    subject: `Pristupni podaci za ${params.childName} – Inovatic`,
    react: createElement(AccountCredentialsEmail, {
      parentName: params.parentName,
      childName: params.childName,
      username: params.username,
      password: params.password,
      groupName: params.groupName,
      schedule: params.schedule,
      locationName: params.locationName,
      locationAddress: params.locationAddress,
    }),
  })
}

const TEACHER_SUBJECTS = {
  new: 'Pristupni podaci – Inovatic',
  reset: 'Nova lozinka – Inovatic',
} as const

/**
 * Teacher account credentials → the teacher. `variant: 'new'` on account
 * creation, `'reset'` on password reset (same template, different subject).
 */
export function sendTeacherCredentialsEmail(params: {
  to: string
  /** The teacher's own city — staff answer their own office, not the other one. */
  city: City
  firstName: string
  lastName: string
  password: string
  variant: keyof typeof TEACHER_SUBJECTS
}): Promise<boolean> {
  const baseUrl = publicBaseUrl()
  return sendTransactionalEmail({
    to: params.to,
    city: params.city,
    subject: TEACHER_SUBJECTS[params.variant],
    react: createElement(TeacherCredentialsEmail, {
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.to,
      password: params.password,
      loginUrl: `${baseUrl}/portal`,
    }),
  })
}

type BulkMessageParams = {
  to: string
  /** Admin-authored in the /admin/email composer — a deliberate exception to
   * the sender-owns-subject rule above. The body ships exactly as written
   * (no auto greeting — parent names are missing on many imported students). */
  subject: string
  bodyText: string
  /** The campaign's city — decides which inbox it is sent from and replied to. */
  city: City
  options?: GroupOption[]
  /**
   * Site-relative path the "Ispunite prijavu" button links to, e.g.
   * `/prijava/slr-3`. Set on REENROLLMENT invitations only — an invitation links
   * to the program it invited the child to, not to the generic catalog, so the
   * parent lands on a form already narrowed to the right termini. Absent = no
   * button.
   */
  signupPath?: string
  /**
   * The report card(s) to render — EVALUATION campaigns only, and in a real send
   * always exactly one, belonging to the child named in `subject`. Passed per
   * call rather than held on the campaign, because this is the one piece of
   * campaign content that differs for every recipient.
   */
  cards?: EvaluationCard[]
}

function buildBulkMessageElement(params: Omit<BulkMessageParams, 'to' | 'city'>) {
  return createElement(BulkMessageEmail, {
    subject: params.subject,
    bodyText: params.bodyText,
    options: params.options,
    cards: params.cards,
    signupUrl: params.signupPath ? `${publicBaseUrl()}${params.signupPath}` : undefined,
  })
}

/**
 * Admin bulk campaign (/admin/email) → one parent per call. A parent hitting
 * Reply must reach the office that mailed them, so both the From address and
 * the reply-to follow the campaign's city.
 */
export function sendBulkMessageEmail(params: BulkMessageParams): Promise<boolean> {
  const { to, city, ...rest } = params
  return sendTransactionalEmail({
    to,
    city,
    subject: params.subject,
    react: buildBulkMessageElement(rest),
  })
}

/**
 * The composer's preview iframe renders through the same element builder as
 * the send path, so what the admin previews is exactly what parents receive.
 */
export function renderBulkMessageHtml(params: Omit<BulkMessageParams, 'to' | 'city'>): Promise<string> {
  return render(buildBulkMessageElement(params))
}
