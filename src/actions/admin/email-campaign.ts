'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import type { City, EmailCampaignKind, RecommendationKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { toGroupOptions } from '@/lib/email-campaign-options'
import { publicSignupPath } from '@/lib/signup-links'
import {
  decodeRecommendation,
  formatRecommendationLabel,
  isBlankAssessment,
  isCompleteAssessment,
} from '@/lib/assessment-rubric'
import {
  buildCredentialsRecipients,
  buildEmailRecipients,
  buildEvaluationRecipients,
  normalizeParentEmail,
  SKIP_REASON_TEXT,
  type EmailRecipient,
  type EvaluationCandidate,
  type SkippedStudent,
} from '@/lib/bulk-email-recipients'
import {
  assertCardsBelongTo,
  toEvaluationCard,
  type EvaluationCard,
} from '@/lib/evaluation-email-cards'
import {
  assertCredentialsBelongTo,
  type CredentialsCard,
} from '@/lib/credentials-email-recipients'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'
import { generateSimplePassword, hashPassword } from '@/lib/password'
// Credentials ride the campaign template (`credentials` on sendBulkMessageEmail),
// not the standalone `sendStudentCredentialsEmail` — that one owns its own
// subject and hard-requires a single group, neither of which fits a campaign.
import { renderBulkMessageHtml, sendBulkMessageEmail } from '@/lib/email'
import {
  previewEmailSchema,
  previewEvaluationRecipientSchema,
  previewRecipientsSchema,
  sendEmailCampaignSchema,
  type PreviewEmailInput,
  type PreviewEvaluationRecipientInput,
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
 * DB mirror of `isGradable` / "not a one-off workshop". Radionice are excluded
 * from a REENROLLMENT cohort (you do not invite a workshop's parents to
 * re-enrol in it) and from an EVALUATION cohort (they are never graded, so they
 * have no cards) — one predicate, two reasons.
 *
 * Two forms because the filter is applied from both sides of the relation:
 * {@link NOT_RADIONICA} in a `course` query, {@link GROUP_NOT_RADIONICA} in a
 * `scheduledGroup` one.
 */
const NOT_RADIONICA = { kind: { not: 'RADIONICA' } } as const
const GROUP_NOT_RADIONICA = { course: NOT_RADIONICA } as const

/**
 * Feed for the CREDENTIALS "pojedinačna djeca" picker: every student enrolled in
 * `sourceYear` in the admin's city, with their groups and their credentials
 * state, so the admin can see at a glance who still needs a password minted and
 * who has already been sent working details.
 *
 * City-scoped like every other feed here. The send re-resolves and re-validates
 * whatever comes back, so this is a convenience list, not a trust boundary.
 */
export async function getEmailStudentOptions(sourceYear: string) {
  const { city } = await requireAdminCtx()
  if (!SCHOOL_YEAR_RE.test(sourceYear)) return []

  const students = await db.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      city,
      enrollments: { some: { schoolYear: sourceYear } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentEmail: true,
      plainPassword: true,
      credentialsSentAt: true,
      enrollments: {
        where: { schoolYear: sourceYear },
        select: { scheduledGroup: { select: { name: true, course: { select: { title: true } } } } },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return students.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`.trim(),
    groupLabel: s.enrollments
      .map((e) =>
        [e.scheduledGroup.name, e.scheduledGroup.course.title].filter(Boolean).join(' · '),
      )
      .join(' | '),
    hasEmail: normalizeParentEmail(s.parentEmail) !== null,
    needsPassword: !s.plainPassword,
    alreadySent: s.credentialsSentAt !== null,
  }))
}

/**
 * Feed for the step-2 grouped multi-select: every course that actually had
 * groups in `sourceYear` in the admin's city, with those groups nested.
 * `excludeRadionice` mirrors the campaign kind — a business rule, not a security
 * boundary; the send re-enforces it in resolveCohort.
 */
export async function getEmailGroupTree(sourceYear: string, excludeRadionice: boolean) {
  const { city } = await requireAdminCtx()
  if (!SCHOOL_YEAR_RE.test(sourceYear)) return []

  const courses = await db.course.findMany({
    where: {
      ...(excludeRadionice ? NOT_RADIONICA : {}),
      scheduledGroups: { some: { schoolYear: sourceYear, city } },
    },
    select: {
      id: true,
      title: true,
      kind: true,
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
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  })

  const gradedByGroup = await countGradedByGroup(
    courses.flatMap((c) => c.scheduledGroups.map((g) => g.id)),
  )

  return courses.map((course) => ({
    ...course,
    scheduledGroups: course.scheduledGroups.map((group) => ({
      ...group,
      /** How many of this group's students have a filled-in report card. */
      gradedCount: gradedByGroup.get(group.id) ?? 0,
    })),
  }))
}

/**
 * Non-blank report cards per group — what the composer shows as "12/14
 * ocijenjeno" so an admin can see which groups are not ready to send before
 * selecting them.
 *
 * Counted in JS rather than with `_count` on purpose: blankness spans ten
 * columns, so the database cannot express it, and counting rows instead would
 * inflate exactly the groups the number exists to warn about.
 */
async function countGradedByGroup(groupIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (groupIds.length === 0) return counts

  const rows = await db.studentAssessment.findMany({
    where: { groupId: { in: groupIds }, student: { role: 'STUDENT', deletedAt: null } },
    select: { groupId: true, ...ASSESSMENT_BLANK_SELECT },
  })
  for (const row of rows) {
    if (isBlankAssessment(row)) continue
    counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1)
  }
  return counts
}

/** The columns `isBlankAssessment` reads — all eight skills plus the two free fields. */
const ASSESSMENT_BLANK_SELECT = {
  slaganje: true,
  programiranje: true,
  razradaIdeja: true,
  izvedivost: true,
  inovacije: true,
  suradnja: true,
  komunikacija: true,
  zabava: true,
  opisnaOcjena: true,
  recommendationKind: true,
} as const

type ResolvedCohort =
  | { ok: true; recipients: EmailRecipient[]; skipped: SkippedStudent[] }
  | { ok: false; error: string }

type CohortFilters = {
  sourceSchoolYear: string
  sourceGroupIds?: string[]
  recommendations?: string[]
  sourceStudentIds?: string[]
}

/**
 * Resolve the campaign audience from the source filters — exactly one of the
 * three selection modes (the validator enforces it; re-checked here). The client
 * never supplies recipients directly.
 */
async function resolveCohort(
  city: City,
  kind: EmailCampaignKind,
  filters: CohortFilters,
): Promise<ResolvedCohort> {
  if (kind === 'EVALUATION') {
    // Groups only — the validator rejects a preporuka selection for this kind,
    // since a preporuka names children rather than the cards being sent.
    return resolveEvaluationCohort(city, filters.sourceSchoolYear, filters.sourceGroupIds ?? [])
  }
  if (kind === 'CREDENTIALS') {
    // Groups or explicitly named children — never a preporuka, which says
    // nothing about which ACCOUNT is being credentialed.
    return resolveCredentialsCohort(
      city,
      filters.sourceSchoolYear,
      filters.sourceGroupIds ?? [],
      filters.sourceStudentIds ?? [],
    )
  }
  if (filters.recommendations?.length) {
    return resolveRecommendationCohort(city, kind, filters.sourceSchoolYear, [
      ...new Set(filters.recommendations),
    ])
  }
  return resolveGroupCohort(city, kind, filters.sourceSchoolYear, filters.sourceGroupIds ?? [])
}

/**
 * Every group the admin selected must exist in their city and the given year —
 * a smuggled id invalidates the whole request rather than being silently
 * dropped, same as sendScheduleOptions.
 */
async function validateSourceGroups(
  city: City,
  kind: EmailCampaignKind,
  sourceSchoolYear: string,
  sourceGroupIds: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (sourceGroupIds.length === 0) return { ok: false, error: INVALID_DATA }
  const ids = [...new Set(sourceGroupIds)]
  const groups = await db.scheduledGroup.findMany({
    where: {
      id: { in: ids },
      city,
      schoolYear: sourceSchoolYear,
      ...(kind === 'CUSTOM' ? {} : GROUP_NOT_RADIONICA),
    },
    select: { id: true },
  })
  if (groups.length !== ids.length) return { ok: false, error: INVALID_DATA }
  return { ok: true, ids }
}

/**
 * Evaluation mode: one recipient per REPORT CARD in the selected groups.
 *
 * Two queries rather than one, because the roster and the cards answer different
 * questions. The cards decide what gets mailed; the roster is what lets an
 * ungraded child be reported BY NAME instead of quietly not appearing — that is
 * the whole point of the skipped list, and the reason an admin can tell "nobody
 * was missed" from "four kids still need grading".
 */
async function resolveEvaluationCohort(
  city: City,
  sourceSchoolYear: string,
  sourceGroupIds: string[],
): Promise<ResolvedCohort> {
  const validated = await validateSourceGroups(city, 'EVALUATION', sourceSchoolYear, sourceGroupIds)
  if (!validated.ok) return validated
  const groupIds = validated.ids

  const [roster, assessments] = await Promise.all([
    db.enrollment.findMany({
      where: {
        schoolYear: sourceSchoolYear,
        scheduledGroupId: { in: groupIds },
        user: { role: 'STUDENT', deletedAt: null },
      },
      select: {
        scheduledGroupId: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.studentAssessment.findMany({
      where: {
        groupId: { in: groupIds },
        student: { role: 'STUDENT', deletedAt: null },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        ...ASSESSMENT_BLANK_SELECT,
        student: { select: { firstName: true, lastName: true, parentEmail: true } },
        group: { select: { name: true, course: { select: { title: true, kind: true } } } },
      },
    }),
  ])

  const candidates: EvaluationCandidate[] = []
  // Keyed by (student, group): a child in two selected groups has two cards, and
  // each is its own mail — nothing here collapses them.
  const graded = new Set<string>()
  for (const row of assessments) {
    if (isBlankAssessment(row)) continue
    graded.add(`${row.studentId}:${row.groupId}`)
    candidates.push({
      assessmentId: row.id,
      studentId: row.studentId,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      parentEmail: row.student.parentEmail,
      groupLabel: [row.group.name, row.group.course.title].filter(Boolean).join(' · '),
      complete: isCompleteAssessment(row.group.course.kind, row),
    })
  }

  const built = buildEvaluationRecipients(candidates)

  // Enrolled but with nothing to send. Deduped by student: a child ungraded in
  // two selected groups is one problem to fix, not two.
  const ungraded = new Map<string, SkippedStudent>()
  for (const entry of roster) {
    if (graded.has(`${entry.user.id}:${entry.scheduledGroupId}`)) continue
    if (ungraded.has(entry.user.id)) continue
    ungraded.set(entry.user.id, {
      studentId: entry.user.id,
      studentName: `${entry.user.firstName} ${entry.user.lastName}`.trim(),
      reason: 'NOT_GRADED',
    })
  }

  return {
    ok: true,
    recipients: built.recipients,
    skipped: [...built.skipped, ...ungraded.values()],
  }
}

/**
 * Credentials mode: one recipient per child ACCOUNT, from either selected groups
 * or explicitly named children.
 *
 * The unit is the account, so a child in two selected groups produces one row
 * listing both groups — unlike EVALUATION, where two groups mean two documents
 * and therefore two mails.
 *
 * Both selection modes validate the same way every other cohort does: a smuggled
 * or cross-city id invalidates the whole request rather than being silently
 * dropped. Children are resolved to their CURRENT groups in the source year for
 * the label, so a row reads the way the mail will.
 */
async function resolveCredentialsCohort(
  city: City,
  sourceSchoolYear: string,
  sourceGroupIds: string[],
  sourceStudentIds: string[],
): Promise<ResolvedCohort> {
  let studentIds: string[]

  if (sourceStudentIds.length > 0) {
    const ids = [...new Set(sourceStudentIds)]
    const found = await db.user.findMany({
      where: { id: { in: ids }, role: 'STUDENT', deletedAt: null, city },
      select: { id: true },
    })
    if (found.length !== ids.length) return { ok: false, error: INVALID_DATA }
    studentIds = ids
  } else {
    const validated = await validateSourceGroups(
      city,
      'CREDENTIALS',
      sourceSchoolYear,
      sourceGroupIds,
    )
    if (!validated.ok) return validated
    const enrollments = await db.enrollment.findMany({
      where: {
        schoolYear: sourceSchoolYear,
        scheduledGroupId: { in: validated.ids },
        user: { role: 'STUDENT', deletedAt: null },
      },
      select: { userId: true },
    })
    studentIds = [...new Set(enrollments.map((e) => e.userId))]
  }

  if (studentIds.length === 0) return { ok: true, recipients: [], skipped: [] }

  const students = await db.user.findMany({
    where: { id: { in: studentIds }, role: 'STUDENT', deletedAt: null, city },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentEmail: true,
      plainPassword: true,
      username: true,
      credentialsSentAt: true,
      enrollments: {
        where: { schoolYear: sourceSchoolYear },
        select: {
          scheduledGroup: {
            select: { name: true, course: { select: { title: true } } },
          },
        },
      },
    },
  })

  return {
    ok: true,
    ...buildCredentialsRecipients(
      students.map((s) => ({
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        parentEmail: s.parentEmail,
        groupLabel: s.enrollments
          .map((e) =>
            [e.scheduledGroup.name, e.scheduledGroup.course.title].filter(Boolean).join(' · '),
          )
          .join(' | '),
        // A null plainPassword means the account has an unusable hash (the Excel
        // importer's doing) — nobody can log in with it, so minting a fresh one
        // at campaign creation destroys nothing.
        needsPassword: !s.plainPassword || !s.username,
        alreadySent: s.credentialsSentAt !== null,
      })),
    ),
  }
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

/**
 * Display labels for the campaign audit (course titles resolved server-side).
 *
 * `recommendations` arrives straight from the client and the validator only
 * checks that each value decodes, which any `course:<cuid>` does — including
 * another city's radionica. Scoped like every other course feed, so a smuggled
 * id resolves to nothing; conditions whose course does not resolve are dropped
 * rather than labelled, so the id cannot reach `sourceRecommendations` at all.
 */
async function labelRecommendations(values: string[], city: City): Promise<string[]> {
  const conditions = decodeRecommendationConditions(values)
  const courseIds = conditions
    .map((c) => c.recommendedCourseId)
    .filter((id): id is string => Boolean(id))
  const titles = courseIds.length
    ? new Map(
        (
          await db.course.findMany({
            where: { id: { in: courseIds }, OR: [{ city: null }, { city }] },
            select: { id: true, title: true },
          })
        ).map((c) => [c.id, c.title]),
      )
    : new Map<string, string>()
  return conditions
    .filter((c) => !c.recommendedCourseId || titles.has(c.recommendedCourseId))
    .map((c) =>
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
        // Radionice are never graded, but keep the invitation rule structural
        // rather than assumed.
        ...(kind === 'REENROLLMENT' ? GROUP_NOT_RADIONICA : {}),
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
  const validated = await validateSourceGroups(city, kind, sourceSchoolYear, sourceGroupIds)
  if (!validated.ok) return validated
  const uniqueIds = validated.ids

  const enrollments = await db.enrollment.findMany({
    where: {
      schoolYear: sourceSchoolYear,
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

/**
 * The termini an invitation offers, plus the signup path its CTA links to.
 *
 * The path is derived from the target course's slug rather than persisted on
 * the campaign — same reasoning as the options themselves, which a resumed send
 * also rebuilds: the campaign stores ids, not rendered content.
 */
async function buildTargetOptions(
  city: City,
  targetYear: string,
  targetCourseId: string,
  targetGroupIds: string[],
): Promise<
  { ok: true; options: GroupOption[]; signupPath: string } | { ok: false; error: string }
> {
  const uniqueIds = [...new Set(targetGroupIds)]
  const groups = await db.scheduledGroup.findMany({
    where: { id: { in: uniqueIds }, city, schoolYear: targetYear, courseId: targetCourseId },
    include: { location: true, course: { select: { kind: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (groups.length !== uniqueIds.length) return { ok: false, error: INVALID_DATA }

  // Every selected group belongs to targetCourseId (the where clause says so),
  // so any of them names the target program.
  const target = groups[0]?.course
  if (!target?.slug) return { ok: false, error: INVALID_DATA }

  return {
    ok: true,
    // `publicSignupPath`, never `signupPathForSlug`: `/prijava/<slug>` answers
    // notFound() for a RADIONICA, and this year's own-city radionice ARE
    // selectable as a target (`getInquiryCourses`). A bare slug path would mail
    // a 404 CTA to the whole cohort — and the sentKey claim would then mark
    // everyone ALREADY_SENT, so the corrected re-send reaches nobody.
    signupPath: publicSignupPath(target.kind, target.slug),
    options: toGroupOptions(groups),
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

/**
 * Render the e-mail one specific recipient row would receive, from the composer's
 * recipient list.
 *
 * Worth its own action rather than reusing the step-1 sample preview: this is how
 * an admin satisfies themselves that a real parent gets their own child's card
 * and nobody else's, before committing to a send. It runs the same
 * `buildCardsForRecipient` the send does — ownership guard included — so what is
 * previewed is what would go out, refusal included.
 *
 * `assessmentId` is re-resolved through the cohort rather than trusted: an id
 * from another city or another year is not in the resolved recipient list, so it
 * cannot be previewed.
 */
export async function previewEvaluationEmailForRecipient(
  input: PreviewEvaluationRecipientInput,
): Promise<PreviewEmailHtmlResult> {
  const { city } = await requireAdminCtx()

  const parsed = previewEvaluationRecipientSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? INVALID_DATA }
  }

  try {
    const cohort = await resolveCohort(city, 'EVALUATION', parsed.data)
    if (!cohort.ok) return { success: false, error: cohort.error }

    const recipient = cohort.recipients.find((r) => r.rowKey === parsed.data.assessmentId)
    if (!recipient) return { success: false, error: INVALID_DATA }

    const built = await buildCardsForRecipient(recipient, city)
    if (!built.ok) return { success: false, error: built.reason }

    const html = await renderBulkMessageHtml({
      subject: `${parsed.data.subject} – ${built.childName}`,
      bodyText: parsed.data.bodyText,
      cards: built.cards,
    })
    return { success: true, html }
  } catch (err) {
    console.error('previewEvaluationEmailForRecipient failed:', err)
    return { success: false, error: 'Greška pri izradi pregleda.' }
  }
}

type PreviewEmailHtmlResult =
  | { success: true; html: string }
  | { success: false; error: string }

/**
 * Stand-in card for the step-1 layout preview. Invented rather than borrowed
 * from a real child: the preview is about the template, and picking a real card
 * would mean answering "whose?" for no benefit. Deliberately partial (`zabava`
 * ungraded) so the "Nije ocijenjeno" state is visible too.
 */
const SAMPLE_EVALUATION_CARD: EvaluationCard = {
  childName: 'Ana Anić (primjer)',
  groupLabel: 'SLR 2 – utorkom · Svijet LEGO robotike 2',
  kind: 'STANDARD',
  skills: {
    slaganje: 'OSTVARENO',
    programiranje: 'U_RAZVOJU',
    razradaIdeja: null,
    izvedivost: null,
    inovacije: 'OSTVARENO',
    suradnja: 'OSTVARENO',
    komunikacija: 'U_RAZVOJU',
    zabava: null,
  },
  opisnaOcjena:
    'Ana je kroz godinu pokazala veliki napredak u samostalnom slaganju modela i rado pomaže drugima u timu.',
  recommendationLabel: 'Svijet LEGO robotike 3',
  authorName: 'Ime Nastavnika',
  updatedAtLabel: '30.06.2026.',
}

/**
 * Stand-in login for the step-1 layout preview. Invented for the same reason as
 * the sample card above, plus a sharper one: the preview is about the template,
 * and rendering a real child's working password into a preview iframe would put
 * a live credential on screen for no benefit.
 */
const SAMPLE_CREDENTIALS_CARD: CredentialsCard = {
  childName: 'Ana Anić (primjer)',
  username: 'ana_anic',
  password: 'a1b2c3',
  groups: [
    {
      label: 'SLR 2 – utorkom · Svijet LEGO robotike 2',
      schedule: 'Utorak, 17:00–18:30',
      locationName: 'Velebitska 32',
      locationAddress: 'Velebitska 32, Split',
    },
  ],
}

/** Renders the exact email (fixed sample parent name) for the step-1 preview iframe. */
export async function previewEmailHtml(input: PreviewEmailInput): Promise<PreviewEmailHtmlResult> {
  const { city } = await requireAdminCtx()

  const parsed = previewEmailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? INVALID_DATA }
  }

  try {
    let options: GroupOption[] | undefined
    let signupPath: string | undefined
    const cards =
      parsed.data.kind === 'EVALUATION' ? [SAMPLE_EVALUATION_CARD] : undefined
    const credentials =
      parsed.data.kind === 'CREDENTIALS' ? SAMPLE_CREDENTIALS_CARD : undefined
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
      signupPath = built.signupPath
    }

    // Both per-child kinds append the child's name to the subject at send time,
    // so the preview shows the sample child's — otherwise the preview subject
    // and the delivered one would differ in shape.
    let previewSubject = parsed.data.subject
    if (parsed.data.kind === 'EVALUATION') {
      previewSubject = `${parsed.data.subject} – ${SAMPLE_EVALUATION_CARD.childName}`
    } else if (parsed.data.kind === 'CREDENTIALS') {
      previewSubject = `${parsed.data.subject} – ${SAMPLE_CREDENTIALS_CARD.childName}`
    }

    const html = await renderBulkMessageHtml({
      subject: previewSubject,
      bodyText: parsed.data.bodyText,
      options,
      signupPath,
      cards,
      credentials,
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

type ReenrollmentPrep =
  | {
      ok: true
      options: GroupOption[] | undefined
      signupPath: string | undefined
      invited: Set<string>
    }
  | { ok: false; error: string }

/**
 * REENROLLMENT-only setup: the invitation's termin boxes, its CTA path and the
 * already-invited parent set. Every other kind passes through with empty
 * defaults so the caller reads one shape.
 */
async function prepareReenrollment(
  city: City,
  targetYear: string,
  data: SendEmailCampaignInput,
): Promise<ReenrollmentPrep> {
  if (data.kind !== 'REENROLLMENT') {
    return { ok: true, options: undefined, signupPath: undefined, invited: new Set() }
  }
  if (isArchivedYear(targetYear)) {
    return {
      ok: false,
      error: 'Pozivnice se šalju u tekuću školsku godinu — promijenite odabranu godinu.',
    }
  }
  const built = await buildTargetOptions(city, targetYear, data.targetCourseId, data.targetGroupIds)
  if (!built.ok) return { ok: false, error: built.error }
  return {
    ok: true,
    options: built.options,
    signupPath: built.signupPath,
    invited: await loadAlreadyInvited(city, data.targetCourseId, targetYear),
  }
}

/** Split the resolved cohort into who gets mail now, and count why the rest don't. */
function partitionRecipients(
  recipients: EmailRecipient[],
  excludedSet: Set<string>,
  invited: Set<string>,
): { toSend: EmailRecipient[]; excluded: number; alreadySent: number } {
  const toSend: EmailRecipient[] = []
  let excluded = 0
  let alreadySent = 0
  for (const recipient of recipients) {
    if (excludedSet.has(recipient.rowKey)) excluded++
    else if (invited.has(recipient.parentEmail)) alreadySent++
    else toSend.push(recipient)
  }
  return { toSend, excluded, alreadySent }
}

/**
 * The unchecked rows, keyed the way this kind's `rowKey` is keyed.
 *
 * Per-child kinds cannot exclude by address: two siblings share one, so
 * unchecking a child would silently drop their sibling too. EVALUATION keys on
 * the report card (two groups = two documents = two rows) and CREDENTIALS on the
 * student (one account, however many groups).
 */
function buildExcludedSet(data: SendEmailCampaignInput): Set<string> {
  if (data.kind === 'EVALUATION') return new Set(data.excludedAssessmentIds ?? [])
  if (data.kind === 'CREDENTIALS') return new Set(data.excludedStudentIds ?? [])
  return new Set(
    (data.excludedParentEmails ?? [])
      .map((e) => normalizeParentEmail(e))
      .filter((e): e is string => e !== null),
  )
}

/**
 * Give every credentialed child a usable password before the send starts.
 *
 * Runs once, inside the campaign-creation transaction. That placement is the
 * whole point: minting inside the send loop would mean a resumed run rotates a
 * password a second time, invalidating the one the first run already mailed —
 * the parent would hold a password that no longer works and nothing would say so.
 *
 * Only accounts with no usable password are touched. A null `plainPassword`
 * means an unusable hash (every historically-imported account), so nobody can
 * log in with it today and replacing it destroys nothing. Accounts that already
 * have one keep it — a parent who was handed the password in person must not
 * find it silently rotated.
 */
async function mintMissingPasswords(
  tx: Prisma.TransactionClient,
  recipients: EmailRecipient[],
): Promise<void> {
  const studentIds = recipients.flatMap((r) => r.studentIds)
  if (studentIds.length === 0) return

  const needing = await tx.user.findMany({
    where: { id: { in: studentIds }, role: 'STUDENT', plainPassword: null },
    select: { id: true },
  })

  for (const student of needing) {
    const password = generateSimplePassword(6)
    await tx.user.update({
      where: { id: student.id },
      data: { passwordHash: await hashPassword(password), plainPassword: password },
    })
  }
}

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

    const prep = await prepareReenrollment(city, targetYear, data)
    if (!prep.ok) return { success: false, error: prep.error }
    const { options, signupPath, invited } = prep

    const cohort = await resolveCohort(city, data.kind, data)
    if (!cohort.ok) return { success: false, error: cohort.error }

    const excludedSet = buildExcludedSet(data)

    const { toSend, excluded, alreadySent } = partitionRecipients(
      cohort.recipients,
      excludedSet,
      invited,
    )

    const sourceRecommendations = data.recommendations?.length
      ? await labelRecommendations(data.recommendations, city)
      : []

    // One transaction: the campaign row and its intended-recipient rows commit
    // together, so a crash here can't leave a campaign whose counters promise a
    // cohort that has no rows (preporuka cohorts can't be re-resolved later —
    // only display labels are stored).
    const campaign = await db.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          city,
          kind: data.kind,
          sourceSchoolYear: data.sourceSchoolYear,
          sourceGroupIds: data.sourceGroupIds ?? [],
          sourceRecommendations,
          sourceStudentIds: data.sourceStudentIds ?? [],
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
        await tx.emailCampaignRecipient.createMany({
          data: cohort.skipped.map((s) => ({
            campaignId: created.id,
            parentEmail: '',
            status: 'SKIPPED' as const,
            childNames: [s.studentName],
            failureReason: SKIP_REASON_TEXT[s.reason],
          })),
        })
      }

      // Write the whole intended cohort upfront so the detail view is complete
      // from the first second and a resumed run knows exactly who is still owed
      // an e-mail — the cohort itself can't always be re-resolved later.
      await tx.emailCampaignRecipient.createMany({
        data: toSend.map((r) => ({
          campaignId: created.id,
          parentEmail: r.parentEmail,
          status: 'PENDING' as const,
          // The group rides along on an evaluation row: one child can hold a card
          // in two selected groups, and those are two separate mails, so the name
          // alone would show as two identical rows on the detail page.
          childNames: r.children.map((c) =>
            c.groupLabel ? `${c.name} · ${c.groupLabel}` : c.name,
          ),
          assessmentIds: r.assessmentIds,
          studentIds: r.studentIds,
        })),
      })

      // Mint the missing passwords HERE, in the same transaction that claims the
      // cohort — never inside the send loop, where a resumed run would rotate a
      // second time and invalidate the password the first mail already
      // delivered. Only accounts with no usable password are touched: a null
      // `plainPassword` means an unusable hash (the Excel importer's doing), so
      // nobody can log in with it and nothing is destroyed.
      if (data.kind === 'CREDENTIALS') {
        await mintMissingPasswords(tx, toSend)
      }

      return created
    })

    const sentKey =
      data.kind === 'REENROLLMENT'
        ? invitationSentKey(city, data.targetCourseId, targetYear)
        : null

    await startSendJob({
      campaignId: campaign.id,
      kind: data.kind,
      city,
      subject: data.subject,
      bodyText: data.bodyText,
      options,
      signupPath,
      sentKey,
      sourceSchoolYear: data.sourceSchoolYear,
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

/**
 * Everything a send needs that is the SAME for every recipient.
 *
 * Note what is absent: there is no field here that could hold one recipient's
 * report card. That is deliberate and load-bearing — per-recipient content is
 * built inside the send loop from the recipient's own row and goes out of scope
 * with that iteration, so the classic mail-merge bug (recipient N+1 receiving
 * recipient N's content) has nowhere to live. Do not add one.
 */
type SendJob = {
  campaignId: string
  kind: EmailCampaignKind
  /** Decides the reply-to inbox — a Šibenik parent must not reply into Split. */
  city: City
  subject: string
  bodyText: string
  options: GroupOption[] | undefined
  /** Where the invitation's CTA points — `/prijava/<target-slug>`. */
  signupPath: string | undefined
  sentKey: string | null
  /**
   * Which year's groups a CREDENTIALS mail lists. A plain scalar, and safe to
   * live here: it is the same for every recipient. The per-child content it
   * helps build is still constructed inside the loop.
   */
  sourceSchoolYear: string
}

/** Everything `toEvaluationCard` and the ownership guard read off a card row. */
const EVALUATION_CARD_SELECT = {
  id: true,
  ...ASSESSMENT_BLANK_SELECT,
  recommendedCourse: { select: { title: true } },
  updatedAt: true,
  author: { select: { firstName: true, lastName: true } },
  student: { select: { firstName: true, lastName: true, parentEmail: true } },
  group: {
    select: { city: true, name: true, course: { select: { title: true, kind: true } } },
  },
} as const

type BuiltCards =
  | { ok: true; cards: EvaluationCard[]; childName: string }
  | { ok: false; reason: string }

/**
 * Load the report card(s) a single recipient row is owed, and prove they may go
 * to that address before returning them.
 *
 * The row's `assessmentIds` were written when the cohort was resolved; this
 * re-derives ownership from the students' CURRENT `parentEmail` and refuses on
 * any disagreement (see `assertCardsBelongTo`). Called once per recipient from
 * inside the send loop — never hoisted.
 */
async function buildCardsForRecipient(
  recipient: { parentEmail: string; assessmentIds: string[] },
  city: City,
): Promise<BuiltCards> {
  const rows = await db.studentAssessment.findMany({
    where: { id: { in: recipient.assessmentIds } },
    select: EVALUATION_CARD_SELECT,
  })

  const verdict = assertCardsBelongTo(
    { parentEmail: recipient.parentEmail, city, assessmentIds: recipient.assessmentIds },
    rows,
  )
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  const cards = rows.map(toEvaluationCard)
  return { ok: true, cards, childName: cards[0].childName }
}

/**
 * Mark one recipient row failed and bump the campaign's counter. Used where the
 * send is refused before it is attempted — an unprovable evaluation card — so
 * `failedCount` still matches the rows and the progress bar can finish.
 */
async function markRecipientFailed(
  recipientId: string,
  campaignId: string,
  reason: string,
): Promise<void> {
  await db.emailCampaignRecipient
    .update({
      where: { id: recipientId },
      data: { status: 'FAILED', sentKey: null, failureReason: reason.slice(0, 300) },
    })
    .catch(() => {})
  await db.emailCampaign
    .update({ where: { id: campaignId }, data: { failedCount: { increment: 1 } } })
    .catch(() => {})
}

/** Everything the credentials card and its ownership guard read off a student. */
const CREDENTIALS_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  parentEmail: true,
  city: true,
  username: true,
  plainPassword: true,
  deletedAt: true,
} as const

type BuiltCredentials =
  | { ok: true; card: CredentialsCard; childName: string; studentId: string }
  | { ok: false; reason: string }

/**
 * Load the login one recipient row is owed, and prove it may go to that address
 * before returning it.
 *
 * The sibling of `buildCardsForRecipient`, and the same discipline: the row's
 * `studentIds` were written when the cohort was resolved, so this re-derives
 * ownership from the student's CURRENT `parentEmail` and refuses on any
 * disagreement (`assertCredentialsBelongTo`). Called once per recipient from
 * inside the send loop — never hoisted, so a password cannot outlive its
 * iteration.
 *
 * The group list is loaded separately from the ownership row: it is display
 * content, and an empty list is fine (a child credentialed before enrollment
 * still gets a working login).
 */
async function buildCredentialsForRecipient(
  recipient: { parentEmail: string; studentIds: string[] },
  city: City,
  sourceSchoolYear: string,
): Promise<BuiltCredentials> {
  const rows = await db.user.findMany({
    where: { id: { in: recipient.studentIds }, role: 'STUDENT' },
    select: CREDENTIALS_SELECT,
  })

  const verdict = assertCredentialsBelongTo(
    { parentEmail: recipient.parentEmail, city, studentIds: recipient.studentIds },
    rows,
  )
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  const student = rows[0]
  const enrollments = await db.enrollment.findMany({
    where: { userId: student.id, schoolYear: sourceSchoolYear },
    select: {
      scheduledGroup: {
        select: {
          name: true,
          dayOfWeek: true,
          dateStart: true,
          dateEnd: true,
          startTime: true,
          endTime: true,
          course: { select: { title: true, kind: true } },
          location: { select: { name: true, address: true } },
        },
      },
    },
  })

  const childName = `${student.firstName} ${student.lastName}`.trim()
  return {
    ok: true,
    studentId: student.id,
    childName,
    card: {
      childName,
      // The guard above already refused a null username/password, so these are
      // non-null here.
      username: student.username ?? '',
      password: student.plainPassword ?? '',
      groups: enrollments.map(({ scheduledGroup: g }) => ({
        label: [g.name, g.course.title].filter(Boolean).join(' · '),
        schedule: formatGroupSchedule({
          dateRange: isRadionica(g.course.kind),
          dayOfWeek: g.dayOfWeek,
          dateStart: g.dateStart,
          dateEnd: g.dateEnd,
          startTime: g.startTime,
          endTime: g.endTime,
        }),
        locationName: g.location.name,
        locationAddress: g.location.address,
      })),
    },
  }
}

/** One PENDING row as the send loop reads it. */
type PendingRecipient = {
  id: string
  parentEmail: string
  assessmentIds: string[]
  studentIds: string[]
}

/**
 * One recipient, start to finish: prove the content (EVALUATION), claim the
 * row, send, record the outcome. Every early return leaves the row in a state
 * the detail page explains.
 */
async function sendToRecipient(job: SendJob, recipient: PendingRecipient): Promise<void> {
  const claimId = recipient.id

  // Declared INSIDE this per-recipient scope: an evaluation card belongs to one
  // recipient and must not be able to survive into the next iteration. See
  // SendJob.
  let cards: EvaluationCard[] | undefined
  let credentials: CredentialsCard | undefined
  let credentialedStudentId: string | undefined
  let subject = job.subject
  if (job.kind === 'EVALUATION') {
    const built = await buildCardsForRecipient(recipient, job.city)
    if (!built.ok) {
      // Fail closed: the card could not be proven to belong to this address,
      // so nothing is sent and the admin sees why.
      await markRecipientFailed(claimId, job.campaignId, built.reason)
      return
    }
    cards = built.cards
    // Naming the child in the subject keeps two mails to one inbox apart, and
    // makes a misdirected card obvious to the person best placed to notice.
    subject = `${job.subject} – ${built.childName}`
  } else if (job.kind === 'CREDENTIALS') {
    const built = await buildCredentialsForRecipient(
      recipient,
      job.city,
      job.sourceSchoolYear,
    )
    if (!built.ok) {
      // Fail closed, for the same reason and with more at stake: an unprovable
      // login is never mailed.
      await markRecipientFailed(claimId, job.campaignId, built.reason)
      return
    }
    credentials = built.card
    credentialedStudentId = built.studentId
    subject = `${job.subject} – ${built.childName}`
  }

  // Claim the parent BEFORE sending. Two protections, for two different
  // overlaps: conditioning on PENDING makes concurrent runs of THIS campaign
  // per-row exclusive (a resume overlapping a still-live job — both read the
  // same snapshot, only one flips each row), while the unique (sentKey,
  // email) slot blocks a re-invite from an EARLIER campaign. Without the
  // status condition the same-campaign overlap re-updated the row to the
  // same values and mailed everyone in the window twice.
  try {
    const claimed = await db.emailCampaignRecipient.updateMany({
      where: { id: claimId, status: 'PENDING' },
      data: { status: 'SENT', sentKey: job.sentKey },
    })
    if (claimed.count === 0) {
      // Another live run of this campaign already owns the row — its writer
      // records the outcome; touching it here would clobber that.
      return
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Already invited — by an overlapping send or an earlier campaign.
      await db.emailCampaignRecipient
        .update({
          where: { id: claimId },
          data: { status: 'ALREADY_SENT', failureReason: 'Roditelj je već primio pozivnicu.' },
        })
        .catch(() => {})
      return
    }
    console.error('runSendJob: could not claim recipient:', err)
    return
  }

  try {
    // Non-throw counts as sent — matches app-wide semantics (the no-key
    // no-op also "succeeds", so dev sends still write SENT log rows).
    await sendBulkMessageEmail({
      to: recipient.parentEmail,
      subject,
      bodyText: job.bodyText,
      city: job.city,
      options: job.options,
      signupPath: job.signupPath,
      cards,
      credentials,
    })
    // "This parent holds a password that currently works." Stamped only after a
    // non-throwing send, and cleared again by resetStudentPassword — so it never
    // claims a rotated password was delivered.
    if (credentialedStudentId) {
      await db.user
        .update({
          where: { id: credentialedStudentId },
          data: { credentialsSentAt: new Date() },
        })
        .catch(() => {})
    }
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
}

/**
 * The actual send. Runs detached from the request, and is safe to run again on
 * the same campaign: every recipient row is claimed (PENDING-conditioned)
 * before their mail goes out, so a resumed or overlapping run skips whoever is
 * already handled.
 */
async function runSendJob(job: SendJob): Promise<void> {
  // Only rows still owed an e-mail. On a resume this is exactly what a killed
  // run left behind; on a first run it is the whole cohort.
  const pending = await db.emailCampaignRecipient.findMany({
    where: { campaignId: job.campaignId, status: 'PENDING' },
    select: { id: true, parentEmail: true, assessmentIds: true, studentIds: true },
  })

  for (let i = 0; i < pending.length; i++) {
    await sendToRecipient(job, pending[i])
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
      sourceSchoolYear: true,
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
  let signupPath: string | undefined
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
    signupPath = built.signupPath
    sentKey = invitationSentKey(city, campaign.targetCourseId, campaign.targetSchoolYear)
  }

  await db.emailCampaign.update({ where: { id: campaignId }, data: { finishedAt: null } })
  await startSendJob({
    campaignId: campaign.id,
    kind: campaign.kind,
    // The lookup above is `where: { id, city }`, so this IS the campaign's city.
    city,
    subject: campaign.subject,
    bodyText: campaign.bodyText,
    sourceSchoolYear: campaign.sourceSchoolYear,
    options,
    signupPath,
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

/**
 * The e-mail a finished campaign sent, rebuilt for the detail page.
 *
 * Nothing rendered is stored — only the inputs are (subject, body, and for an
 * invitation the target program and its termin group ids) — so this re-runs the
 * send path's own `renderBulkMessageHtml` over them. For CUSTOM that is exactly
 * what went out; for REENROLLMENT the termin boxes are rebuilt from the same ids
 * a resumed send would use.
 *
 * On EVALUATION this renders the shared layout WITHOUT a card: the card belongs
 * to one child and is opened per recipient via {@link getRecipientEmailHtml},
 * never at campaign level.
 */
export async function getCampaignEmailHtml(campaignId: string): Promise<PreviewEmailHtmlResult> {
  const { city } = await requireAdminCtx()

  const campaign = await db.emailCampaign.findFirst({
    where: { id: campaignId, city },
    select: {
      kind: true,
      subject: true,
      bodyText: true,
      targetCourseId: true,
      targetGroupIds: true,
      targetSchoolYear: true,
      targetCourse: { select: { kind: true, slug: true } },
    },
  })
  if (!campaign) notFound()

  try {
    let options: GroupOption[] | undefined
    let signupPath: string | undefined

    if (campaign.kind === 'REENROLLMENT' && campaign.targetCourse) {
      // Deliberately NOT `getSelectedSchoolYear()` — the campaign's own target
      // year is what it was sent for, and the admin's selected year moves on.
      const groups = await db.scheduledGroup.findMany({
        where: {
          id: { in: [...new Set(campaign.targetGroupIds)] },
          city,
          courseId: campaign.targetCourseId ?? undefined,
          schoolYear: campaign.targetSchoolYear ?? undefined,
        },
        include: { location: true, course: { select: { kind: true } } },
        orderBy: { createdAt: 'asc' },
      })
      // No strict count check, unlike the send path: a group deleted since must
      // not make the sent mail unviewable. Whatever survives is rendered.
      options = groups.length > 0 ? toGroupOptions(groups) : undefined
      // Same rule as the send path — the preview must show the link that was
      // actually mailed, radionica included.
      signupPath = publicSignupPath(
        campaign.targetCourse.kind,
        campaign.targetCourse.slug,
      )
    }

    const html = await renderBulkMessageHtml({
      subject: campaign.subject,
      bodyText: campaign.bodyText,
      options,
      signupPath,
    })
    return { success: true, html }
  } catch (err) {
    console.error('getCampaignEmailHtml failed:', err)
    return { success: false, error: 'Greška pri izradi pregleda.' }
  }
}

/**
 * The e-mail ONE recipient row received — EVALUATION only, where every row
 * carries a different report card.
 *
 * Loads the card through {@link buildCardsForRecipient}, so `assertCardsBelongTo`
 * remains the only path by which a card is ever read for an e-mail. If it now
 * refuses (the card was deleted, or the parent's address was corrected after the
 * send), the refusal is the answer — it is exactly what an admin looking back at
 * a FAILED row needs to read.
 */
export async function getRecipientEmailHtml(recipientId: string): Promise<PreviewEmailHtmlResult> {
  const { city } = await requireAdminCtx()

  const recipient = await db.emailCampaignRecipient.findFirst({
    // City lives on the campaign — scoping through it makes a cross-city id
    // indistinguishable from a nonexistent one.
    where: { id: recipientId, campaign: { city } },
    select: {
      parentEmail: true,
      assessmentIds: true,
      campaign: { select: { kind: true, subject: true, bodyText: true } },
    },
  })
  if (!recipient) notFound()
  if (recipient.campaign.kind !== 'EVALUATION') return { success: false, error: INVALID_DATA }

  try {
    const built = await buildCardsForRecipient(recipient, city)
    if (!built.ok) return { success: false, error: built.reason }

    const html = await renderBulkMessageHtml({
      // Rebuilt exactly as the send composed it, child's name included.
      subject: `${recipient.campaign.subject} – ${built.childName}`,
      bodyText: recipient.campaign.bodyText,
      cards: built.cards,
    })
    return { success: true, html }
  } catch (err) {
    console.error('getRecipientEmailHtml failed:', err)
    return { success: false, error: 'Greška pri izradi pregleda.' }
  }
}
