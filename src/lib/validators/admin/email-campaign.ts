import { z } from 'zod'
import { decodeRecommendation } from '@/lib/assessment-rubric'
import {
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_BODY_MIN_LENGTH,
  resolveEmailBody,
} from '@/lib/email-rich-text'

const schoolYearField = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, 'Nevaljana školska godina.')

// Cohort selection — exactly ONE of the three modes per request (enforced by
// requireExactlyOneSelection, applied on every schema embedding these fields;
// discriminatedUnion members must stay plain ZodObjects, so the refine lives
// on the outer schema):
//  - groups: explicit sourceGroupIds from the grouped multi-select
//  - preporuka: `recommendations` — encoded PREPORUKA dropdown values
//    (`course:<id>` or a special-track kind, the encodeRecommendation format);
//    every student of the year whose report card matches one of them,
//    regardless of group or program
//  - pojedinačna djeca: `sourceStudentIds` — explicitly picked children.
//    CREDENTIALS only, because it is the only kind whose unit is an account
//    rather than a document or an inbox.
const selectionFields = {
  sourceSchoolYear: schoolYearField,
  // The cap bounds the query, it is not a business rule: "Odaberi sve grupe"
  // legitimately submits every group a city ran in a year, which is well under
  // this but far over the old limit of 100.
  sourceGroupIds: z.array(z.string().min(1)).max(400, 'Najviše 400 grupa.').optional(),
  recommendations: z
    .array(
      z
        .string()
        .min(1)
        .max(120)
        .refine(
          (v) => decodeRecommendation(v).recommendationKind !== null,
          'Nevaljana preporuka.',
        ),
    )
    .max(20, 'Najviše 20 preporuka.')
    .optional(),
  sourceStudentIds: z
    .array(z.string().min(1).max(50))
    .max(500, 'Najviše 500 djece.')
    .optional(),
}

function requireExactlyOneSelection(
  value: {
    kind?: string
    sourceGroupIds?: string[]
    recommendations?: unknown[]
    sourceStudentIds?: string[]
  },
  ctx: z.RefinementCtx,
) {
  const hasGroups = (value.sourceGroupIds?.length ?? 0) > 0
  const hasRecommendations = (value.recommendations?.length ?? 0) > 0
  const hasStudents = (value.sourceStudentIds?.length ?? 0) > 0
  const modes = [hasGroups, hasRecommendations, hasStudents].filter(Boolean).length
  if (modes !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Odaberite grupe, preporuku ili pojedinačnu djecu.',
    })
    return
  }
  // A preporuka cohort is every child of the year matching that recommendation,
  // across groups and programs — it names children, not report cards, so it
  // cannot say WHICH card to send. Groups can.
  if (value.kind === 'EVALUATION' && hasRecommendations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Evaluacije se šalju odabirom grupa.',
    })
  }
  // Same reasoning one step further: a preporuka says nothing about which
  // ACCOUNT is being credentialed, so credentials are selected by group or by
  // naming the children outright.
  if (value.kind === 'CREDENTIALS' && hasRecommendations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pristupni podaci šalju se odabirom grupa ili pojedinačne djece.',
    })
  }
  // The individual-children mode exists for CREDENTIALS only. Every other
  // resolver keys its content off a group or a report card and has nothing to
  // build from a bare student id.
  if (hasStudents && value.kind !== 'CREDENTIALS') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Odabir pojedinačne djece moguć je samo za pristupne podatke.',
    })
  }
}

const subjectField = z
  .string()
  .trim()
  .min(3, 'Predmet je obavezan.')
  .max(200, 'Maksimalno 200 znakova.')

const bodyTextField = z
  .string()
  .trim()
  .min(EMAIL_BODY_MIN_LENGTH, 'Tekst poruke je obavezan.')
  .max(EMAIL_BODY_MAX_LENGTH, `Maksimalno ${EMAIL_BODY_MAX_LENGTH} znakova.`)

/**
 * The formatted body from the composer, unvalidated here on purpose: the block
 * shape has exactly one definition (`parseRichBlocks`), and a Zod mirror of it
 * would be a second one free to drift. `validateBody` below runs the real
 * normalizer and rejects what does not survive it; the cap is only to bound the
 * payload before that walk.
 */
const bodyBlocksField = z.array(z.unknown()).max(2000, 'Poruka je predugačka.').optional()

/**
 * Enforce the message bounds on the text a PARENT will read.
 *
 * `bodyTextField` above still guards the plain-text path, but once blocks are
 * present the plain text is re-derived from them, so it is the derived value
 * that has to fit — otherwise a short `bodyText` would wave a 6000-character
 * formatted body through.
 */
function validateBody(
  value: { bodyText?: string; bodyBlocks?: unknown[] },
  ctx: z.RefinementCtx,
) {
  if (value.bodyBlocks === undefined) return
  const resolved = resolveEmailBody({
    bodyText: value.bodyText ?? '',
    bodyBlocks: value.bodyBlocks,
  })
  if (!resolved.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: resolved.error, path: ['bodyText'] })
  }
}

// Unchecked rows from the recipient curation list. The server re-resolves the
// cohort from the filters and only SUBTRACTS these — a tampered client can
// shrink the audience, never grow it.
const excludedParentEmailsField = z
  .array(z.string().trim().max(200))
  .max(500, 'Previše isključenih primatelja.')
  .optional()

/**
 * EVALUATION's exclusion key. It cannot be the parent's e-mail like the other
 * kinds: an evaluation row is one child, so two siblings share an address, and
 * excluding by address would silently drop the sibling of every child the admin
 * unchecked. The report card is the only identifier that names exactly one row.
 */
const excludedAssessmentIdsField = z
  .array(z.string().min(1).max(50))
  .max(1000, 'Previše isključenih primatelja.')
  .optional()

const customContent = {
  kind: z.literal('CUSTOM'),
  subject: subjectField,
  bodyText: bodyTextField,
  bodyBlocks: bodyBlocksField,
}

/**
 * The evaluation send carries no target program and no CTA — the content is the
 * child's own report card, resolved per recipient at send time. Only groups can
 * select this cohort (a preporuka filter would select children across years and
 * groups whose card is not the one being sent), enforced below.
 */
const evaluationContent = {
  kind: z.literal('EVALUATION'),
  subject: subjectField,
  bodyText: bodyTextField,
  bodyBlocks: bodyBlocksField,
}

/**
 * CREDENTIALS' exclusion key. Like EVALUATION it cannot be the parent's e-mail —
 * a credentials row is one child, so two siblings share an address. The STUDENT
 * is the identifier that names exactly one row (not the enrollment: a child in
 * two selected groups is still a single account, hence a single mail).
 */
const excludedStudentIdsField = z
  .array(z.string().min(1).max(50))
  .max(1000, 'Previše isključenih primatelja.')
  .optional()

/**
 * The credentials send carries no target program and no CTA — the content is the
 * child's own username/password plus their current groups, resolved per
 * recipient at send time.
 */
const credentialsContent = {
  kind: z.literal('CREDENTIALS'),
  subject: subjectField,
  bodyText: bodyTextField,
  bodyBlocks: bodyBlocksField,
}

const reenrollmentContent = {
  kind: z.literal('REENROLLMENT'),
  subject: subjectField,
  bodyText: bodyTextField,
  bodyBlocks: bodyBlocksField,
  targetCourseId: z.string().min(1, 'Odaberite program.'),
  targetGroupIds: z
    .array(z.string().min(1))
    .min(1, 'Odaberite barem jednu grupu.')
    .max(20, 'Najviše 20 grupa.'),
}

export const sendEmailCampaignSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...customContent,
      ...selectionFields,
      excludedParentEmails: excludedParentEmailsField,
    }),
    z.object({
      ...reenrollmentContent,
      ...selectionFields,
      excludedParentEmails: excludedParentEmailsField,
    }),
    z.object({
      ...evaluationContent,
      ...selectionFields,
      excludedAssessmentIds: excludedAssessmentIdsField,
    }),
    z.object({
      ...credentialsContent,
      ...selectionFields,
      excludedStudentIds: excludedStudentIdsField,
    }),
  ])
  .superRefine(requireExactlyOneSelection)
  .superRefine(validateBody)

// The step-2 live recipient resolution; targetCourseId lets the invitation
// kind compute its "već poslano" skip-set alongside the cohort.
export const previewRecipientsSchema = z
  .object({
    kind: z.enum(['CUSTOM', 'REENROLLMENT', 'EVALUATION', 'CREDENTIALS']),
    ...selectionFields,
    targetCourseId: z.string().min(1).optional(),
  })
  .superRefine(requireExactlyOneSelection)

// The step-1 email preview needs content only — no cohort yet.
export const previewEmailSchema = z
  .discriminatedUnion('kind', [
    z.object(customContent),
    z.object(reenrollmentContent),
    z.object(evaluationContent),
    z.object(credentialsContent),
  ])
  .superRefine(validateBody)

/**
 * "Show me exactly what THIS parent will receive" — the cohort filters plus the
 * composed message plus which row to render. The cohort is re-resolved
 * server-side and `assessmentId` must appear in it, so an id the admin is not
 * entitled to cannot be previewed.
 */
export const previewEvaluationRecipientSchema = z
  .object({
    ...evaluationContent,
    ...selectionFields,
    assessmentId: z.string().min(1).max(50),
  })
  .superRefine(requireExactlyOneSelection)
  .superRefine(validateBody)

export type SendEmailCampaignInput = z.infer<typeof sendEmailCampaignSchema>
export type PreviewRecipientsInput = z.infer<typeof previewRecipientsSchema>
export type PreviewEmailInput = z.infer<typeof previewEmailSchema>
export type PreviewEvaluationRecipientInput = z.infer<
  typeof previewEvaluationRecipientSchema
>
