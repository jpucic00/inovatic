import { createElement } from 'react'
import { sendTransactionalEmail } from './client'
import InquiryConfirmationEmail from '../../../emails/inquiry-confirmation'
import PartyInquiryConfirmationEmail from '../../../emails/party-inquiry-confirmation'
import ScheduleOptionsEmail, { type GroupOption } from '../../../emails/schedule-options'
import AccountCredentialsEmail from '../../../emails/account-credentials'
import TeacherCredentialsEmail from '../../../emails/teacher-credentials'

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
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'https://udruga-inovatic.hr'
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
