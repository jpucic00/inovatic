'use server'

import { revalidatePath } from 'next/cache'
import type { City, EmailCampaignKind, RecommendationKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { formatGroupSchedule } from '@/lib/format'
import { decodeRecommendation, formatRecommendationLabel } from '@/lib/assessment-rubric'
import {
  buildEmailRecipients,
  normalizeParentEmail,
  type EmailRecipient,
  type SkippedStudent,
} from '@/lib/bulk-email-recipients'
import { renderBulkMessageHtml, sendBulkMessageEmail } from '@/lib/email'
import {
  previewEmailSchema,
  previewRecipientsSchema,
  sendEmailCampaignSchema,
  type PreviewEmailInput,
  type PreviewRecipientsInput,
  type SendEmailCampaignInput,
} from '@/lib/validators/admin/email-campaign'
import type { GroupOption } from '../../../emails/schedule-options'

const INVALID_DATA = 'Nevaljani podaci.'
const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/

// Resend's free tier allows 2 requests/second.
const SEND_THROTTLE_MS = 600

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Feed for the step-2 grouped multi-select: every course that actually had
 * groups in `sourceYear` in the admin's city, with those groups nested.
 * `standardOnly` mirrors the campaign kind (REENROLLMENT never offers
 * radionice) — a business rule, not a security boundary; the send re-enforces
 * it in resolveCohort.
 */
export async function getEmailGroupTree(sourceYear: string, standardOnly: boolean) {
  const { city } = await requireAdminCtx()
  if (!SCHOOL_YEAR_RE.test(sourceYear)) return []

  return db.course.findMany({
    where: {
      ...(standardOnly ? { isCustom: false } : {}),
      scheduledGroups: { some: { schoolYear: sourceYear, city } },
    },
    select: {
      id: true,
      title: true,
      isCustom: true,
      scheduledGroups: {
        where: { schoolYear: sourceYear, city },
        select: {
          id: true,
          name: true,
          dayOfWeek: true,
          dateStart: true,
          dateEnd: true,
          startTime: true,
          endTime: true,
          location: { select: { name: true } },
          _count: { select: { enrollments: { where: { schoolYear: sourceYear } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
  })
}

type ResolvedCohort =
  | { ok: true; recipients: EmailRecipient[]; skipped: SkippedStudent[] }
  | { ok: false; error: string }

type CohortFilters = {
  sourceSchoolYear: string
  sourceGroupIds?: string[]
  recommendations?: string[]
}

/**
 * Resolve the campaign audience from the source filters — exactly one of the
 * two selection modes (the validator enforces it; re-checked here). The client
 * never supplies recipients directly.
 */
async function resolveCohort(
  city: City,
  kind: EmailCampaignKind,
  filters: CohortFilters,
): Promise<ResolvedCohort> {
  if (filters.recommendations?.length) {
    return resolveRecommendationCohort(city, kind, filters.sourceSchoolYear, [
      ...new Set(filters.recommendations),
    ])
  }
  return resolveGroupCohort(city, kind, filters.sourceSchoolYear, filters.sourceGroupIds ?? [])
}

/** Encoded PREPORUKA values → assessment where-conditions (invalid entries drop). */
function decodeRecommendationConditions(
  values: string[],
): { recommendationKind: RecommendationKind; recommendedCourseId?: string }[] {
  const conditions: { recommendationKind: RecommendationKind; recommendedCourseId?: string }[] = []
  for (const value of values) {
    const decoded = decodeRecommendation(value)
    if (!decoded.recommendationKind) continue
    conditions.push(
      decoded.recommendationKind === 'COURSE' && decoded.recommendedCourseId
        ? { recommendationKind: 'COURSE', recommendedCourseId: decoded.recommendedCourseId }
        : { recommendationKind: decoded.recommendationKind },
    )
  }
  return conditions
}

/** Display labels for the campaign audit (course titles resolved server-side). */
async function labelRecommendations(values: string[]): Promise<string[]> {
  const conditions = decodeRecommendationConditions(values)
  const courseIds = conditions
    .map((c) => c.recommendedCourseId)
    .filter((id): id is string => Boolean(id))
  const titles = courseIds.length
    ? new Map(
        (
          await db.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        ).map((c) => [c.id, c.title]),
      )
    : new Map<string, string>()
  return conditions.map((c) =>
    formatRecommendationLabel(
      c.recommendationKind,
      c.recommendedCourseId ? (titles.get(c.recommendedCourseId) ?? null) : null,
    ),
  )
}

/**
 * Preporuka mode: every student of the year (admin's city) whose report card
 * on ANY group of that year matches one of the selected preporuka filters —
 * a specific recommended course (`course:<id>`) or a special track —
 * deliberately group- and program-independent. City/year scoping rides on the
 * assessment's group; the recommendation label doubles as the list badge.
 */
async function resolveRecommendationCohort(
  city: City,
  kind: EmailCampaignKind,
  sourceSchoolYear: string,
  values: string[],
): Promise<ResolvedCohort> {
  const conditions = decodeRecommendationConditions(values)
  if (conditions.length === 0) return { ok: false, error: INVALID_DATA }

  const assessments = await db.studentAssessment.findMany({
    where: {
      OR: conditions,
      group: {
        city,
        schoolYear: sourceSchoolYear,
        // Assessments exist only on standard programs, but keep the invitation
        // rule structural rather than assumed.
        ...(kind === 'REENROLLMENT' ? { course: { isCustom: false } } : {}),
      },
      student: { role: 'STUDENT', deletedAt: null },
    },
    select: {
      recommendationKind: true,
      recommendedCourse: { select: { title: true } },
      student: {
        select: { id: true, firstName: true, lastName: true, parentEmail: true },
      },
    },
  })

  return {
    ok: true,
    ...buildEmailRecipients(
      assessments.map((a) => ({
        ...a.student,
        recommendation: a.recommendationKind
          ? formatRecommendationLabel(a.recommendationKind, a.recommendedCourse?.title ?? null)
          : null,
      })),
    ),
  }
}

/**
 * Group mode: every selected group must exist in the admin's city and the
 * given year (and be a standard-program group for REENROLLMENT) — a smuggled
 * id invalidates the whole request, same as sendScheduleOptions.
 */
async function resolveGroupCohort(
  city: City,
  kind: EmailCampaignKind,
  sourceSchoolYear: string,
  sourceGroupIds: string[],
): Promise<ResolvedCohort> {
  if (sourceGroupIds.length === 0) return { ok: false, error: INVALID_DATA }
  const filters = { sourceSchoolYear, sourceGroupIds }
  const uniqueIds = [...new Set(filters.sourceGroupIds)]
  const groups = await db.scheduledGroup.findMany({
    where: {
      id: { in: uniqueIds },
      city,
      schoolYear: filters.sourceSchoolYear,
      ...(kind === 'REENROLLMENT' ? { course: { isCustom: false } } : {}),
    },
    select: { id: true },
  })
  if (groups.length !== uniqueIds.length) return { ok: false, error: INVALID_DATA }

  const enrollments = await db.enrollment.findMany({
    where: {
      schoolYear: filters.sourceSchoolYear,
      scheduledGroupId: { in: uniqueIds },
      user: { role: 'STUDENT', deletedAt: null },
    },
    select: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          parentEmail: true,
        },
      },
    },
  })

  // Invitation cohorts surface each child's source-year preporuka (report-card
  // recommendation on one of the selected groups) as a badge in the list.
  const recommendationByStudent = new Map<string, string>()
  if (kind === 'REENROLLMENT' && enrollments.length > 0) {
    const studentIds = [...new Set(enrollments.map((e) => e.user.id))]
    const assessments = await db.studentAssessment.findMany({
      where: {
        studentId: { in: studentIds },
        groupId: { in: uniqueIds },
        recommendationKind: { not: null },
      },
      select: {
        studentId: true,
        recommendationKind: true,
        recommendedCourse: { select: { title: true } },
      },
    })
    for (const a of assessments) {
      if (!a.recommendationKind) continue
      recommendationByStudent.set(
        a.studentId,
        formatRecommendationLabel(a.recommendationKind, a.recommendedCourse?.title ?? null),
      )
    }
  }

  return {
    ok: true,
    ...buildEmailRecipients(
      enrollments.map((e) => ({
        ...e.user,
        recommendation: recommendationByStudent.get(e.user.id) ?? null,
      })),
    ),
  }
}

/** Parents already SENT an invitation to this target program+year (any source cohort). */
async function loadAlreadyInvited(
  city: City,
  targetCourseId: string,
  targetSchoolYear: string,
): Promise<Set<string>> {
  const rows = await db.emailCampaignRecipient.findMany({
    where: {
      status: 'SENT',
      campaign: { city, kind: 'REENROLLMENT', targetCourseId, targetSchoolYear },
    },
    select: { parentEmail: true },
  })
  return new Set(rows.map((r) => r.parentEmail))
}

async function buildTargetOptions(
  city: City,
  targetYear: string,
  targetCourseId: string,
  targetGroupIds: string[],
): Promise<{ ok: true; options: GroupOption[] } | { ok: false; error: string }> {
  const uniqueIds = [...new Set(targetGroupIds)]
  const groups = await db.scheduledGroup.findMany({
    where: { id: { in: uniqueIds }, city, schoolYear: targetYear, courseId: targetCourseId },
    include: { location: true, course: { select: { isCustom: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (groups.length !== uniqueIds.length) return { ok: false, error: INVALID_DATA }

  return {
    ok: true,
    options: groups.map((g) => ({
      groupName: g.name ?? 'Grupa',
      schedule: formatGroupSchedule({
        isCustom: g.course.isCustom,
        dayOfWeek: g.dayOfWeek,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        startTime: g.startTime,
        endTime: g.endTime,
      }),
      locationName: g.location.name,
      locationAddress: g.location.address,
    })),
  }
}

export type PreviewRecipientsResult =
  | {
      success: true
      recipients: EmailRecipient[]
      skipped: SkippedStudent[]
      /** Invitation kind only: cohort emails already invited to the target program+year. */
      alreadySent: string[]
    }
  | { success: false; error: string }

export async function previewEmailRecipients(
  input: PreviewRecipientsInput,
): Promise<PreviewRecipientsResult> {
  const { city } = await requireAdminCtx()

  const parsed = previewRecipientsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? INVALID_DATA }
  }

  try {
    const cohort = await resolveCohort(city, parsed.data.kind, parsed.data)
    if (!cohort.ok) return { success: false, error: cohort.error }

    let alreadySent: string[] = []
    if (parsed.data.kind === 'REENROLLMENT' && parsed.data.targetCourseId) {
      const targetYear = await getSelectedSchoolYear()
      const invited = await loadAlreadyInvited(city, parsed.data.targetCourseId, targetYear)
      alreadySent = cohort.recipients.map((r) => r.parentEmail).filter((e) => invited.has(e))
    }

    return {
      success: true,
      recipients: cohort.recipients,
      skipped: cohort.skipped,
      alreadySent,
    }
  } catch (err) {
    console.error('previewEmailRecipients failed:', err)
    return { success: false, error: 'Greška pri dohvaćanju primatelja.' }
  }
}

type PreviewEmailHtmlResult =
  | { success: true; html: string }
  | { success: false; error: string }

/** Renders the exact email (fixed sample parent name) for the step-1 preview iframe. */
export async function previewEmailHtml(input: PreviewEmailInput): Promise<PreviewEmailHtmlResult> {
  const { city } = await requireAdminCtx()

  const parsed = previewEmailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? INVALID_DATA }
  }

  try {
    let options: GroupOption[] | undefined
    if (parsed.data.kind === 'REENROLLMENT') {
      const targetYear = await getSelectedSchoolYear()
      const built = await buildTargetOptions(
        city,
        targetYear,
        parsed.data.targetCourseId,
        parsed.data.targetGroupIds,
      )
      if (!built.ok) return { success: false, error: built.error }
      options = built.options
    }

    const html = await renderBulkMessageHtml({
      subject: parsed.data.subject,
      bodyText: parsed.data.bodyText,
      options,
      includeSignupCta: parsed.data.kind === 'REENROLLMENT',
    })
    return { success: true, html }
  } catch (err) {
    console.error('previewEmailHtml failed:', err)
    return { success: false, error: 'Greška pri izradi pregleda.' }
  }
}

export type SendEmailCampaignResult =
  | {
      success: true
      sent: number
      alreadySent: number
      excluded: number
      failed: string[]
      skipped: SkippedStudent[]
    }
  | { success: false; error: string }

export async function sendEmailCampaign(
  input: SendEmailCampaignInput,
): Promise<SendEmailCampaignResult> {
  const { session, city } = await requireAdminCtx()

  const parsed = sendEmailCampaignSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? INVALID_DATA }
  }
  const data = parsed.data

  try {
    const targetYear = await getSelectedSchoolYear()

    let options: GroupOption[] | undefined
    let invited = new Set<string>()
    if (data.kind === 'REENROLLMENT') {
      if (isArchivedYear(targetYear)) {
        return {
          success: false,
          error: 'Pozivnice se šalju u tekuću školsku godinu — promijenite odabranu godinu.',
        }
      }
      const built = await buildTargetOptions(city, targetYear, data.targetCourseId, data.targetGroupIds)
      if (!built.ok) return { success: false, error: built.error }
      options = built.options
      invited = await loadAlreadyInvited(city, data.targetCourseId, targetYear)
    }

    const cohort = await resolveCohort(city, data.kind, data)
    if (!cohort.ok) return { success: false, error: cohort.error }

    const excludedSet = new Set(
      (data.excludedParentEmails ?? [])
        .map((e) => normalizeParentEmail(e))
        .filter((e): e is string => e !== null),
    )

    const toSend: EmailRecipient[] = []
    let excluded = 0
    let alreadySent = 0
    for (const recipient of cohort.recipients) {
      if (excludedSet.has(recipient.parentEmail)) excluded++
      else if (invited.has(recipient.parentEmail)) alreadySent++
      else toSend.push(recipient)
    }

    const campaign = await db.emailCampaign.create({
      data: {
        city,
        kind: data.kind,
        sourceSchoolYear: data.sourceSchoolYear,
        sourceGroupIds: data.sourceGroupIds ?? [],
        sourceRecommendations: data.recommendations?.length
          ? await labelRecommendations(data.recommendations)
          : [],
        targetSchoolYear: data.kind === 'REENROLLMENT' ? targetYear : null,
        targetCourseId: data.kind === 'REENROLLMENT' ? data.targetCourseId : null,
        subject: data.subject,
        bodyText: data.bodyText,
        sentById: session.user.id,
        skippedCount: cohort.skipped.length,
        excludedCount: excluded,
      },
    })

    let sent = 0
    const failed: string[] = []
    for (let i = 0; i < toSend.length; i++) {
      const recipient = toSend[i]
      try {
        // Non-throw counts as sent — matches app-wide semantics (the no-key
        // no-op also "succeeds", so dev sends still write SENT log rows).
        await sendBulkMessageEmail({
          to: recipient.parentEmail,
          subject: data.subject,
          bodyText: data.bodyText,
          options,
          includeSignupCta: data.kind === 'REENROLLMENT',
        })
        sent++
        await db.emailCampaignRecipient.create({
          data: { campaignId: campaign.id, parentEmail: recipient.parentEmail, status: 'SENT' },
        })
      } catch (err) {
        console.error(`sendEmailCampaign: send to ${recipient.parentEmail} failed:`, err)
        failed.push(recipient.parentEmail)
        await db.emailCampaignRecipient
          .create({
            data: { campaignId: campaign.id, parentEmail: recipient.parentEmail, status: 'FAILED' },
          })
          .catch(() => {})
      }
      if (process.env.RESEND_API_KEY && i < toSend.length - 1) await sleep(SEND_THROTTLE_MS)
    }

    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: { sentCount: sent, failedCount: failed.length },
    })

    revalidatePath('/admin/email')
    return { success: true, sent, alreadySent, excluded, failed, skipped: cohort.skipped }
  } catch (err) {
    console.error('sendEmailCampaign failed:', err)
    return { success: false, error: 'Greška pri slanju e-maila.' }
  }
}

/** History table feed — the city's latest campaigns, newest first. */
export async function getEmailCampaigns() {
  const { city } = await requireAdminCtx()
  return db.emailCampaign.findMany({
    where: { city },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      sourceSchoolYear: true,
      sourceGroupIds: true,
      sourceRecommendations: true,
      targetSchoolYear: true,
      subject: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      excludedCount: true,
      createdAt: true,
      sentBy: { select: { firstName: true, lastName: true } },
      targetCourse: { select: { title: true } },
    },
  })
}
