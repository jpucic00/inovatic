'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import {
  inquirySchema,
  partyInquirySchema,
  type InquiryFormData,
  type PartyInquiryFormData,
} from '@/lib/validators/inquiry'
import { getActivePrograms, type ActiveProgram } from '@/actions/public/programs'
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { InquiryConfirmationEmail } from '../../emails/inquiry-confirmation'
import { PartyInquiryConfirmationEmail } from '../../emails/party-inquiry-confirmation'
import { computeSchoolYear } from '@/lib/school-year'
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
      // Derive the inquiry's school year server-side: the year of the chosen
      // group (so future-year enrollments file under that year, not "now"),
      // else the current computed year for group-less general inquiries.
      let schoolYear = computeSchoolYear()
      if (scheduledGroupId) {
        await assertGroupHasAvailableSpot(tx, scheduledGroupId)
        const group = await tx.scheduledGroup.findUnique({
          where: { id: scheduledGroupId },
          select: { schoolYear: true },
        })
        schoolYear = group?.schoolYear ?? schoolYear
      }
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
          schoolYear,
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
        }),
      })
    }
  } catch (err) {
    console.error('Failed to send inquiry confirmation email:', err)
  }

  return { success: true }
}

/** 'YYYY-MM-DD' → 'dd.MM.yyyy.' for human-facing copy (email body). */
function isoToCroatianDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}

/**
 * Public submission of the /proslave party (proslava) booking form. Creates a
 * PARTY-typed Inquiry (no child/course) with the parent's first+last name
 * combined into `parentName`, then sends a confirmation email mirroring the
 * course flow. Files under the school year of the preferred date when given.
 */
export async function submitPartyInquiry(
  data: PartyInquiryFormData,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = partyInquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const { parentFirstName, parentLastName, parentPhone, parentEmail, message, partyProposedDate } =
    parsed.data

  const proposedIso = partyProposedDate && partyProposedDate.length > 0 ? partyProposedDate : null
  const proposedDate = proposedIso ? new Date(`${proposedIso}T00:00:00.000Z`) : null
  const parentName = `${parentFirstName} ${parentLastName}`.trim()

  try {
    await db.inquiry.create({
      data: {
        type: 'PARTY',
        parentName,
        parentEmail,
        parentPhone,
        message,
        partyProposedDate: proposedDate,
        // File under the CURRENT school year (when received) so the inquiry
        // shows up in the admin's current Upiti view — the proposed date is
        // only the parent's preference. The booking is re-filed under the
        // confirmed date's year later, in schedulePartyInquiry.
        schoolYear: computeSchoolYear(),
        consentGivenAt: new Date(),
      },
    })
  } catch (err) {
    console.error('submitPartyInquiry failed:', err)
    return { success: false, error: 'Greška pri slanju upita. Pokušajte ponovo.' }
  }

  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: parentEmail,
        subject: 'Zaprimili smo vaš upit za proslavu – Inovatic',
        react: createElement(PartyInquiryConfirmationEmail, {
          parentName,
          proposedDate: proposedIso ? isoToCroatianDate(proposedIso) : undefined,
        }),
      })
    }
  } catch (err) {
    console.error('Failed to send party inquiry confirmation email:', err)
  }

  return { success: true }
}
