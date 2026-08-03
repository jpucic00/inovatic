'use server'

import { Prisma } from '@prisma/client'
import type { City, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import {
  sendInquiryConfirmationEmail,
  sendPartyInquiryConfirmationEmail,
  type InquiryNextStep,
} from '@/lib/email'
import {
  inquirySchema,
  partyInquirySchema,
  type InquiryFormData,
  type PartyInquiryFormData,
} from '@/lib/validators/inquiry'
import { getActivePrograms, getSignupProgram, type ActiveProgram } from '@/actions/public/programs'
import { isTerminRequired } from '@/lib/inquiry-availability'
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { CITY_LABELS } from '@/lib/city'
import { computeSchoolYear } from '@/lib/school-year'
import { isHighSchoolGrade } from '@/lib/inquiry-status'
import { isCompetition, isRadionica } from '@/lib/program-kind'
import { radionicaDepositAmount } from '@/lib/radionica-deposit'
import { isRadionicaOpenForSignup } from '@/lib/session-dates'

// Thrown when a submitted group does not belong to the submitted city — a
// stale/tampered payload the client-side city filter would normally prevent.
class GroupCityMismatchError extends Error {}

// Thrown when the submitted termin is a radionica that has already started. The
// form drops those groups (see `isRadionicaOpenForSignup`), so reaching here
// means a tab that was open across the start date, or a crafted payload.
class RadionicaStartedError extends Error {}

/**
 * The program an inquiry targets, from its chosen group when there is one (the
 * authoritative source — the client cannot make a group belong to a different
 * course) and otherwise from the submitted courseId.
 */
async function resolveTargetCourse(
  scheduledGroupId: string | undefined,
  courseId: string | undefined,
): Promise<{ id: string; slug: string; kind: ProgramKind; price: number | null } | null> {
  const select = { id: true, slug: true, kind: true, price: true } as const
  if (scheduledGroupId) {
    const group = await db.scheduledGroup.findUnique({
      where: { id: scheduledGroupId },
      select: { course: { select } },
    })
    if (group) return group.course
  }
  if (courseId) return db.course.findUnique({ where: { id: courseId }, select })
  return null
}

/**
 * The program list the "termin required" re-check runs against: the public
 * catalog for an ordinary inquiry, or the single program behind a per-program
 * signup link. Without the second branch a competition inquiry would always see
 * an empty catalog and treat its termin as optional.
 */
async function loadProgramsForCheck(
  city: City,
  targetCourse: { slug: string } | null,
): Promise<ActiveProgram[]> {
  if (targetCourse) {
    const program = await getSignupProgram(city, targetCourse.slug)
    return program ? [program] : []
  }
  return getActivePrograms(city)
}

/**
 * What the confirmation e-mail should promise the parent. Since the form gained
 * its termin dropdown most parents book their own slot, so the blanket "we will
 * contact you with available termini" is only true for the two cases where no
 * slot was taken: none was on offer, or the competitive program's parent said
 * none of the offered ones suit them.
 */
function inquiryNextStep(
  scheduledGroupId: string | undefined,
  noSuitableTermin: boolean | undefined,
): InquiryNextStep {
  if (scheduledGroupId) return 'TERMIN_CHOSEN'
  if (noSuitableTermin) return 'TERMIN_TO_ARRANGE'
  return 'TERMIN_TO_OFFER'
}

type InquiryActionResult =
  | { success: true }
  | { success: false; error: string }
  | {
      success: false
      error: string
      code: 'GROUP_FULL' | 'TERMIN_REQUIRED' | 'TERMIN_CLOSED'
      programs: ActiveProgram[]
    }

/**
 * The two answers only the competitive program's signup link offers: a
 * srednjoškolski razred, and "Ne odgovara mi predloženi termin" (which also
 * satisfies the termin requirement). Both are enforced against the
 * server-resolved course rather than trusting which <option>s rendered, so a
 * tampered payload cannot file a srednjoškolac into an SLR group or use the
 * refusal flag to skip the termin choice on any other program.
 */
function competitionOnlyAnswerError(
  grade: string,
  noSuitableTermin: boolean | undefined,
  targetCourse: { kind: ProgramKind } | null,
): string | null {
  const competition = targetCourse !== null && isCompetition(targetCourse.kind)
  if (isHighSchoolGrade(grade) && !competition) {
    return 'Za odabrani program nije moguće odabrati srednjoškolski razred.'
  }
  if (noSuitableTermin && !competition) {
    return 'Za odabrani program potrebno je odabrati jedan od dostupnih termina.'
  }
  return null
}

/**
 * Maps a submitInquiry transaction failure onto the public result union. The
 * business refusals ship a refreshed program feed so the stale option
 * disappears from the form immediately.
 */
async function submitInquiryErrorResult(
  err: unknown,
  city: City,
  targetCourse: { slug: string } | null,
): Promise<InquiryActionResult> {
  if (err instanceof GroupCityMismatchError) {
    return {
      success: false,
      error: 'Odabrani termin nije dostupan za odabrani grad. Osvježite stranicu i pokušajte ponovno.',
    }
  }
  if (err instanceof RadionicaStartedError) {
    // Hand back the same feed the page renders from, so the expired termin
    // disappears from the dropdown instead of waiting for the 30s poll.
    return {
      success: false,
      error: 'Odabrana radionica je u međuvremenu započela. Molimo odaberite drugi termin.',
      code: 'TERMIN_CLOSED' as const,
      programs: await loadProgramsForCheck(city, targetCourse),
    }
  }
  if (err instanceof GroupFullError) {
    return {
      success: false,
      error: 'Odabrani termin je u međuvremenu popunjen. Molimo odaberite drugi termin.',
      code: 'GROUP_FULL' as const,
      programs: await getActivePrograms(city),
    }
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
    return { success: false, error: 'Pokušajte ponovno.' }
  }
  console.error('submitInquiry failed:', err)
  return { success: false, error: 'Greška pri slanju upita. Pokušajte ponovo.' }
}

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
    noSuitableTermin,
    message,
    referralSource,
  } = parsed.data

  // Which program this inquiry is for, resolved server-side. Preferred source
  // is the chosen group (a tampered `courseId` cannot contradict it); the
  // submitted courseId is the fallback for the preselected flows that allow a
  // termin-less "leave your details" inquiry.
  const targetCourse = await resolveTargetCourse(scheduledGroupId, courseId)

  const guardError = competitionOnlyAnswerError(grade, noSuitableTermin, targetCourse)
  if (guardError) {
    return { success: false, error: guardError }
  }

  // Server-side mirror of the client's conditional requirement: when no termin
  // was sent but the grade/course still has an open, non-full group, reject with
  // the fresh programs so a stale or tampered payload can't skip the choice. The
  // client passes `courseId` only in the radionica/preselected flow, so it maps
  // to the same "preselected course" argument the client uses. The refusal
  // answers the question, so it stands in for a chosen termin here.
  if (!scheduledGroupId && !noSuitableTermin) {
    // Per-program links resolve against their own feed: the competitive program
    // is deliberately absent from getActivePrograms, so checking against the
    // public catalog would silently make its termin optional.
    const programs = await loadProgramsForCheck(city, targetCourse)
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
          select: {
            schoolYear: true,
            city: true,
            dateStart: true,
            course: { select: { kind: true } },
          },
        })
        // Fail closed: a group must belong to the submitted city. The client
        // only offers same-city groups, so a mismatch is a stale/tampered
        // payload — reject rather than mis-file the inquiry cross-city.
        if (group?.city !== city) throw new GroupCityMismatchError()
        // Same fail-closed mirror for the radionica start-date cutoff: the form
        // stops offering a workshop on its first day, so accepting one here
        // would let a long-open tab book a termin that has already run.
        if (
          isRadionica(group.course.kind) &&
          !isRadionicaOpenForSignup(group.dateStart, new Date())
        ) {
          throw new RadionicaStartedError()
        }
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
          noSuitableTermin: noSuitableTermin ?? false,
          schoolYear,
          message: message || null,
          referralSource: referralSource || null,
          consentGivenAt: new Date(),
          city,
        },
      })
    })
  } catch (err) {
    return submitInquiryErrorResult(err, city, targetCourse)
  }

  // Radionice are confirmed by a booking deposit, so their confirmation e-mail
  // carries the payment instruction; SLR and natjecateljski sign-ups are settled
  // later and get the plain confirmation. Two things must both hold: a termin was
  // actually booked (the deposit is "za odabrani ciklus" — a parent who left their
  // details because every termin had passed has nothing to pay for yet), and the
  // radionica has a price (a free workshop asks for nothing, so
  // `radionicaDepositAmount` returns null and the whole block drops).
  const depositAmount =
    scheduledGroupId && targetCourse && isRadionica(targetCourse.kind)
      ? radionicaDepositAmount(targetCourse.price)
      : null

  try {
    await sendInquiryConfirmationEmail({
      to: parentEmail,
      parentName,
      childName: `${childFirstName} ${childLastName}`,
      childDateOfBirth,
      cityLabel: CITY_LABELS[city],
      nextStep: inquiryNextStep(scheduledGroupId, noSuitableTermin),
      depositAmount: depositAmount ?? undefined,
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
