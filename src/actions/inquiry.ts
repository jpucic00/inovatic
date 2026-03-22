'use server'

import { db } from '@/lib/db'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { inquirySchema, type InquiryFormData } from '@/lib/validators/inquiry'
import { InquiryConfirmationEmail } from '../../emails/inquiry-confirmation'
import { createElement } from 'react'

export type InquiryActionResult =
  | { success: true }
  | { success: false; error: string }

export async function submitInquiry(data: InquiryFormData): Promise<InquiryActionResult> {
  const parsed = inquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const {
    parentName,
    parentEmail,
    parentPhone,
    childFirstName,
    childLastName,
    childDateOfBirth,
    childSchool,
    courseId,
    scheduledGroupId,
    message,
    referralSource,
  } = parsed.data

  try {
    await db.inquiry.create({
      data: {
        parentName,
        parentEmail,
        parentPhone,
        childFirstName,
        childLastName,
        childDateOfBirth,
        childSchool: childSchool || null,
        courseId: courseId || null,
        scheduledGroupId: scheduledGroupId || null,
        message: message || null,
        referralSource: referralSource || null,
        consentGivenAt: new Date(),
      },
    })
  } catch (err) {
    console.error('submitInquiry failed:', err)
    return { success: false, error: 'Greška pri slanju upita. Pokušajte ponovo.' }
  }

  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: parentEmail,
        subject: `Zaprimili smo vašu prijavu – Inovatic`,
        react: createElement(InquiryConfirmationEmail, {
          parentName,
          childName: `${childFirstName} ${childLastName}`,
          childDateOfBirth,
          courseLevelPref: undefined,
        }),
      })
    }
  } catch (err) {
    console.error('Failed to send inquiry confirmation email:', err)
  }

  return { success: true }
}
