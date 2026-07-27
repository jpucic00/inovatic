'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
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
/**
 * Resend allows 2 requests/second. Read per call, not at module load, so a test
 * that sets the override in `beforeAll` (after the import) still takes effect —
 * otherwise background jobs outlive their test file and corrupt the next one.
 */
function sendThrottleMs(): number {
  return Number(process.env.EMAIL_SEND_THROTTLE_MS ?? 600)
}

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
/**
 * The value stored on a SENT invitation row. Null for CUSTOM, which is
 * deliberately repeatable. Paired with the `(sentKey, parentEmail)` unique
 * index, this is what actually prevents a double invitation — the pre-flight
 * `loadAlreadyInvited` read below is only there to show an accurate preview.
 */
function invitationSentKey(
  city: City,
  targetCourseId: string,
  targetSchoolYear: string,
): string {
  return `${city}:REENROLLMENT:${targetCourseId}:${targetSchoolYear}`
}

/** Prisma's unique-constraint violation — here, "already invited". */
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

async function loadAlreadyInvited(
  city: City,
  targetCourseId: string,
  targetSchoolYear: string,
): Promise<Set<string>> {
  const rows = await db.emailCampaignRecipient.findMany({
    where: { sentKey: invitationSentKey(city, targetCourseId, targetSchoolYear) },
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
      /** The send runs in the background — poll `getCampaignProgress` with this. */
      campaignId: string
      /** How many parents this send set out to mail. */
      total: number
      alreadySent: number
      excluded: number
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
        targetGroupIds: data.kind === 'REENROLLMENT' ? data.targetGroupIds : [],
        subject: data.subject,
        bodyText: data.bodyText,
        sentById: session.user.id,
        skippedCount: cohort.skipped.length,
        excludedCount: excluded,
        totalCount: toSend.length,
      },
    })

    // Persist the children nobody could be mailed for, so the detail view can
    // name them instead of showing an anonymous "skipped: 3".
    if (cohort.skipped.length > 0) {
      await db.emailCampaignRecipient.createMany({
        data: cohort.skipped.map((s) => ({
          campaignId: campaign.id,
          parentEmail: '',
          status: 'SKIPPED' as const,
          childNames: [s.studentName],
          failureReason:
            s.reason === 'MISSING_EMAIL'
              ? 'Roditelj nema upisanu e-mail adresu.'
              : 'E-mail adresa roditelja nije ispravna.',
        })),
      })
    }

    const sentKey =
      data.kind === 'REENROLLMENT'
        ? invitationSentKey(city, data.targetCourseId, targetYear)
        : null

    // Write the whole intended cohort upfront so the detail view is complete
    // from the first second and a resumed run knows exactly who is still owed
    // an e-mail — the cohort itself can't always be re-resolved later.
    await db.emailCampaignRecipient.createMany({
      data: toSend.map((r) => ({
        campaignId: campaign.id,
        parentEmail: r.parentEmail,
        status: 'PENDING' as const,
        childNames: r.children.map((c) => c.name),
      })),
    })

    await startSendJob({
      campaignId: campaign.id,
      subject: data.subject,
      bodyText: data.bodyText,
      options,
      includeSignupCta: data.kind === 'REENROLLMENT',
      sentKey,
    })

    revalidatePath('/admin/email')
    return {
      success: true,
      campaignId: campaign.id,
      total: toSend.length,
      alreadySent,
      excluded,
      skipped: cohort.skipped,
    }
  } catch (err) {
    console.error('sendEmailCampaign failed:', err)
    return { success: false, error: 'Greška pri slanju e-maila.' }
  }
}

/**
 * Railway runs a long-lived Node process, so leaving the job unawaited keeps the
 * send going after the response — the admin can close the tab. A redeploy still
 * kills it, which is what `resumeEmailCampaign` is for.
 *
 * Under test we await instead: the integration suite shares one database, and a
 * job outliving its test file writes into the next one's data.
 */
async function startSendJob(job: SendJob): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    await runSendJob(job)
    return
  }
  void runSendJob(job).catch((err) => {
    console.error('runSendJob crashed:', err)
  })
}

type SendJob = {
  campaignId: string
  subject: string
  bodyText: string
  options: GroupOption[] | undefined
  includeSignupCta: boolean
  sentKey: string | null
}

/**
 * The actual send. Runs detached from the request, and is safe to run again on
 * the same campaign: every parent is claimed in the database before their mail
 * goes out, so a resumed run skips whoever already received it.
 */
async function runSendJob(job: SendJob): Promise<void> {
  // Only rows still owed an e-mail. On a resume this is exactly what a killed
  // run left behind; on a first run it is the whole cohort.
  const pending = await db.emailCampaignRecipient.findMany({
    where: { campaignId: job.campaignId, status: 'PENDING' },
    select: { id: true, parentEmail: true },
  })

  for (let i = 0; i < pending.length; i++) {
    const recipient = pending[i]
    const claimId = recipient.id

    // Claim the parent BEFORE sending, by taking the unique (sentKey, email)
    // slot. A concurrent send loses this write and skips, so an invitation
    // cannot go out twice even when two sends overlap.
    try {
      await db.emailCampaignRecipient.update({
        where: { id: claimId },
        data: { status: 'SENT', sentKey: job.sentKey },
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Already invited — by an overlapping send or an earlier campaign.
        await db.emailCampaignRecipient
          .update({
            where: { id: claimId },
            data: { status: 'ALREADY_SENT', failureReason: 'Roditelj je već primio pozivnicu.' },
          })
          .catch(() => {})
        continue
      }
      console.error('runSendJob: could not claim recipient:', err)
      continue
    }

    try {
      // Non-throw counts as sent — matches app-wide semantics (the no-key
      // no-op also "succeeds", so dev sends still write SENT log rows).
      await sendBulkMessageEmail({
        to: recipient.parentEmail,
        subject: job.subject,
        bodyText: job.bodyText,
        options: job.options,
        includeSignupCta: job.includeSignupCta,
      })
      // Counts increment per recipient so progress polling is live and an
      // interrupted campaign still reports exactly what went out.
      await db.emailCampaign
        .update({ where: { id: job.campaignId }, data: { sentCount: { increment: 1 } } })
        .catch(() => {})
    } catch (err) {
      console.error(`runSendJob: send to ${recipient.parentEmail} failed:`, err)
      // Release the claim so a resume may invite this parent again.
      await db.emailCampaignRecipient
        .update({
          where: { id: claimId },
          data: {
            status: 'FAILED',
            sentKey: null,
            failureReason: err instanceof Error ? err.message.slice(0, 300) : 'Nepoznata greška.',
          },
        })
        .catch(() => {})
      await db.emailCampaign
        .update({ where: { id: job.campaignId }, data: { failedCount: { increment: 1 } } })
        .catch(() => {})
    }
    const throttle = sendThrottleMs()
    if (throttle > 0 && process.env.RESEND_API_KEY && i < pending.length - 1) {
      await sleep(throttle)
    }
  }

  await db.emailCampaign
    .update({ where: { id: job.campaignId }, data: { finishedAt: new Date() } })
    .catch(() => {})
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
      totalCount: true,
      finishedAt: true,
      sentBy: { select: { firstName: true, lastName: true } },
      targetCourse: { select: { title: true } },
    },
  })
}

/**
 * Finish a campaign a deploy or crash interrupted. Safe to call repeatedly:
 * only PENDING rows are picked up, so nobody who already received the mail is
 * mailed again — the unique index backs that up even under a race.
 */
export async function resumeEmailCampaign(
  campaignId: string,
): Promise<{ success: true; remaining: number } | { success: false; error: string }> {
  const { city } = await requireAdminCtx()
  const campaign = await db.emailCampaign.findFirst({
    where: { id: campaignId, city },
    select: {
      id: true,
      kind: true,
      subject: true,
      bodyText: true,
      targetCourseId: true,
      targetSchoolYear: true,
      targetGroupIds: true,
      _count: { select: { recipients: { where: { status: 'PENDING' } } } },
    },
  })
  if (!campaign) notFound()

  const remaining = campaign._count.recipients
  if (remaining === 0) {
    // Nothing left — just close it out so the UI stops offering a resume.
    await db.emailCampaign.update({
      where: { id: campaignId },
      data: { finishedAt: new Date() },
    })
    revalidatePath(`/admin/email/${campaignId}`)
    return { success: true, remaining: 0 }
  }

  let options: GroupOption[] | undefined
  let sentKey: string | null = null
  if (campaign.kind === 'REENROLLMENT' && campaign.targetCourseId && campaign.targetSchoolYear) {
    const built = await buildTargetOptions(
      city,
      campaign.targetSchoolYear,
      campaign.targetCourseId,
      campaign.targetGroupIds,
    )
    if (!built.ok) return { success: false, error: built.error }
    options = built.options
    sentKey = invitationSentKey(city, campaign.targetCourseId, campaign.targetSchoolYear)
  }

  await db.emailCampaign.update({ where: { id: campaignId }, data: { finishedAt: null } })
  await startSendJob({
    campaignId: campaign.id,
    subject: campaign.subject,
    bodyText: campaign.bodyText,
    options,
    includeSignupCta: campaign.kind === 'REENROLLMENT',
    sentKey,
  })

  revalidatePath(`/admin/email/${campaignId}`)
  return { success: true, remaining }
}

/** Polled by the wizard while a send runs. City-scoped like every other read. */
export async function getCampaignProgress(campaignId: string) {
  const { city } = await requireAdminCtx()
  const campaign = await db.emailCampaign.findFirst({
    where: { id: campaignId, city },
    select: {
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      totalCount: true,
      finishedAt: true,
    },
  })
  if (!campaign) notFound()
  return { ...campaign, finished: campaign.finishedAt !== null }
}

export type CampaignDetail = NonNullable<Awaited<ReturnType<typeof getCampaignDetail>>>

/**
 * Everything the campaign detail page shows: the summary plus one row per
 * recipient, so the admin can answer "did this child's parent get the mail?".
 */
export async function getCampaignDetail(campaignId: string) {
  const { city } = await requireAdminCtx()
  const campaign = await db.emailCampaign.findFirst({
    where: { id: campaignId, city },
    select: {
      id: true,
      kind: true,
      subject: true,
      bodyText: true,
      sourceSchoolYear: true,
      targetSchoolYear: true,
      sourceRecommendations: true,
      sentCount: true,
      failedCount: true,
      skippedCount: true,
      excludedCount: true,
      totalCount: true,
      finishedAt: true,
      createdAt: true,
      sentBy: { select: { firstName: true, lastName: true } },
      targetCourse: { select: { title: true } },
    },
  })
  if (!campaign) notFound()

  const recipients = await db.emailCampaignRecipient.findMany({
    where: { campaignId },
    // Problems first — the whole point of this page is finding who was missed.
    orderBy: [{ status: 'desc' }, { parentEmail: 'asc' }],
    select: {
      id: true,
      parentEmail: true,
      childNames: true,
      status: true,
      failureReason: true,
      sentAt: true,
    },
  })

  return {
    ...campaign,
    finished: campaign.finishedAt !== null,
    recipients: recipients.map((r) => ({
      ...r,
      sentAt: r.sentAt.toISOString(),
    })),
  }
}
