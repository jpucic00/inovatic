'use server'

import { Prisma } from '@prisma/client'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { inquirySchema, type InquiryFormData } from '@/lib/validators/inquiry'
import { getActivePrograms, type ActiveProgram } from '@/actions/public/programs'
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { InquiryConfirmationEmail } from '../../emails/inquiry-confirmation'
import { createElement } from 'react'

type InquiryActionResult =
  | { success: true }
  | { success: false; error: string }
  | { success: false; error: string; code: 'GROUP_FULL'; programs: ActiveProgram[] }

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
    grade,
    courseId,
    scheduledGroupId,
    message,
    referralSource,
  } = parsed.data

  try {
    await runWithGroupCapacityGuard(async (tx) => {
      if (scheduledGroupId) await assertGroupHasAvailableSpot(tx, scheduledGroupId)
      return tx.inquiry.create({
        data: {
          parentName,
          parentEmail,
          parentPhone,
          childFirstName,
          childLastName,
          childDateOfBirth,
          childSchool: childSchool || null,
          childGrade: grade || null,
          courseId: courseId || null,
          scheduledGroupId: scheduledGroupId || null,
          message: message || null,
          referralSource: referralSource || null,
          consentGivenAt: new Date(),
        },
      })
    })
  } catch (err) {
    if (err instanceof GroupFullError) {
      const freshPrograms = await getActivePrograms()
      return {
        success: false,
        error: 'Odabrani termin je u međuvremenu popunjen. Molimo odaberite drugi termin.',
        code: 'GROUP_FULL' as const,
        programs: freshPrograms,
      }
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return { success: false, error: 'Pokušajte ponovno.' }
    }
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
