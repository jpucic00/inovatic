'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { sendInquiryConfirmationEmail, sendPartyInquiryConfirmationEmail } from '@/lib/email'
import {
  inquirySchema,
  partyInquirySchema,
  type InquiryFormData,
  type PartyInquiryFormData,
} from '@/lib/validators/inquiry'
import { getActivePrograms, type ActiveProgram } from '@/actions/public/programs'
import { isTerminRequired } from '@/lib/inquiry-availability'
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { CITY_LABELS } from '@/lib/city'
import { computeSchoolYear } from '@/lib/school-year'

// Thrown when a submitted group does not belong to the submitted city — a
// stale/tampered payload the client-side city filter would normally prevent.
class GroupCityMismatchError extends Error {}

type InquiryActionResult =
  | { success: true }
  | { success: false; error: string }
  | { success: false; error: string; code: 'GROUP_FULL' | 'TERMIN_REQUIRED'; programs: ActiveProgram[] }

export async function submitInquiry(data: InquiryFormData): Promise<InquiryActionResult> {
  const parsed = inquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const {
    city,
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

  // Server-side mirror of the client's conditional requirement: when no termin
  // was sent but the grade/course still has an open, non-full group, reject with
  // the fresh programs so a stale or tampered payload can't skip the choice. The
  // client passes `courseId` only in the radionica/preselected flow, so it maps
  // to the same "preselected course" argument the client uses.
  if (!scheduledGroupId) {
    const programs = await getActivePrograms(city)
    if (isTerminRequired(programs, grade, courseId)) {
      return {
        success: false,
        error: 'Za odabrani razred dostupni su termini – odaberite jedan.',
        code: 'TERMIN_REQUIRED' as const,
        programs,
      }
    }
  }

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
          select: { schoolYear: true, city: true },
        })
        // Fail closed: a group must belong to the submitted city. The client
        // only offers same-city groups, so a mismatch is a stale/tampered
        // payload — reject rather than mis-file the inquiry cross-city.
        if (group?.city !== city) throw new GroupCityMismatchError()
        schoolYear = group.schoolYear
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
          city,
        },
      })
    })
  } catch (err) {
    if (err instanceof GroupCityMismatchError) {
      return {
        success: false,
        error: 'Odabrani termin nije dostupan za odabrani grad. Osvježite stranicu i pokušajte ponovno.',
      }
    }
    if (err instanceof GroupFullError) {
      const freshPrograms = await getActivePrograms(city)
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
    await sendInquiryConfirmationEmail({
      to: parentEmail,
      parentName,
      childName: `${childFirstName} ${childLastName}`,
      childDateOfBirth,
      cityLabel: CITY_LABELS[city],
    })
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
        // Proslave are Split-only (owner decision 2026-07-10)
        city: 'SPLIT',
      },
    })
  } catch (err) {
    console.error('submitPartyInquiry failed:', err)
    return { success: false, error: 'Greška pri slanju upita. Pokušajte ponovo.' }
  }

  try {
    await sendPartyInquiryConfirmationEmail({
      to: parentEmail,
      parentName,
      proposedDate: proposedIso ? isoToCroatianDate(proposedIso) : undefined,
    })
  } catch (err) {
    console.error('Failed to send party inquiry confirmation email:', err)
  }

  return { success: true }
}
