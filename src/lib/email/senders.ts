import { createElement } from 'react'
import { render } from '@react-email/components'
import type { City } from '@prisma/client'
import { ASSOCIATION_EMAIL, sendTransactionalEmail } from './client'
import InquiryConfirmationEmail from '../../../emails/inquiry-confirmation'
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
 * Callers keep their own error policy — the senders never swallow.
 */

/** Public course-inquiry confirmation → the parent who submitted the form. */
export function sendInquiryConfirmationEmail(params: {
  to: string
  parentName: string
  childName: string
  childDateOfBirth: string
  cityLabel?: string
  courseLevelPref?: string
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
    subject: 'Zaprimili smo vašu prijavu – Inovatic',
    react: createElement(InquiryConfirmationEmail, {
      parentName: params.parentName,
      childName: params.childName,
      childDateOfBirth: params.childDateOfBirth,
      cityLabel: params.cityLabel,
      courseLevelPref: params.courseLevelPref,
    }),
  })
}

/** Public party (proslava) confirmation → the parent who submitted the form. */
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

/** Admin-picked schedule options → the inquiry's parent (this one invites a reply). */
export function sendScheduleOptionsEmail(params: {
  to: string
  parentName: string
  childName: string
  options: GroupOption[]
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: params.to,
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
  firstName: string
  lastName: string
  password: string
  variant: keyof typeof TEACHER_SUBJECTS
}): Promise<boolean> {
  const baseUrl = publicBaseUrl()
  return sendTransactionalEmail({
    to: params.to,
    subject: TEACHER_SUBJECTS[params.variant],
    react: createElement(TeacherCredentialsEmail, {
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.to,
      password: params.password,
      loginUrl: `${baseUrl}/prijava`,
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
  /** The campaign's city — decides which inbox a parent's reply lands in. */
  city: City
  options?: GroupOption[]
  /**
   * Site-relative path the "Ispunite prijavu" button links to, e.g.
   * `/upisi/slr-3`. Set on REENROLLMENT invitations only — an invitation links
   * to the program it invited the child to, not to the generic catalog, so the
   * parent lands on a form already narrowed to the right termini. Absent = no
   * button.
   */
  signupPath?: string
}

/** Šibenik parents reply to Šibenik; Split keeps the default association inbox. */
const SIBENIK_EMAIL = 'prijave.sibenik@udruga-inovatic.hr'
const replyToForCity = (city: City) => (city === 'SIBENIK' ? SIBENIK_EMAIL : undefined)

function buildBulkMessageElement(params: Omit<BulkMessageParams, 'to' | 'city'>) {
  return createElement(BulkMessageEmail, {
    subject: params.subject,
    bodyText: params.bodyText,
    options: params.options,
    signupUrl: params.signupPath ? `${publicBaseUrl()}${params.signupPath}` : undefined,
  })
}

/** Admin bulk campaign (/admin/email) → one parent per call. */
export function sendBulkMessageEmail(params: BulkMessageParams): Promise<boolean> {
  const { to, ...rest } = params
  return sendTransactionalEmail({
    to,
    subject: params.subject,
    replyTo: replyToForCity(params.city),
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
