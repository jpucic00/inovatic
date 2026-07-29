import { z } from 'zod'
import { decodeRecommendation } from '@/lib/assessment-rubric'

const schoolYearField = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, 'Nevaljana školska godina.')

// Cohort selection — exactly ONE of the two modes per request (enforced by
// requireExactlyOneSelection, applied on every schema embedding these fields;
// discriminatedUnion members must stay plain ZodObjects, so the refine lives
// on the outer schema):
//  - groups: explicit sourceGroupIds from the grouped multi-select
//  - preporuka: `recommendations` — encoded PREPORUKA dropdown values
//    (`course:<id>` or a special-track kind, the encodeRecommendation format);
//    every student of the year whose report card matches one of them,
//    regardless of group or program
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
}

function requireExactlyOneSelection(
  value: { kind?: string; sourceGroupIds?: string[]; recommendations?: unknown[] },
  ctx: z.RefinementCtx,
) {
  const hasGroups = (value.sourceGroupIds?.length ?? 0) > 0
  const hasRecommendations = (value.recommendations?.length ?? 0) > 0
  if (hasGroups === hasRecommendations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Odaberite grupe ili preporuku.',
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
}

const subjectField = z
  .string()
  .trim()
  .min(3, 'Predmet je obavezan.')
  .max(200, 'Maksimalno 200 znakova.')

const bodyTextField = z
  .string()
  .trim()
  .min(10, 'Tekst poruke je obavezan.')
  .max(5000, 'Maksimalno 5000 znakova.')

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
}

const reenrollmentContent = {
  kind: z.literal('REENROLLMENT'),
  subject: subjectField,
  bodyText: bodyTextField,
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
  ])
  .superRefine(requireExactlyOneSelection)

// The step-2 live recipient resolution; targetCourseId lets the invitation
// kind compute its "već poslano" skip-set alongside the cohort.
export const previewRecipientsSchema = z
  .object({
    kind: z.enum(['CUSTOM', 'REENROLLMENT', 'EVALUATION']),
    ...selectionFields,
    targetCourseId: z.string().min(1).optional(),
  })
  .superRefine(requireExactlyOneSelection)

// The step-1 email preview needs content only — no cohort yet.
export const previewEmailSchema = z.discriminatedUnion('kind', [
  z.object(customContent),
  z.object(reenrollmentContent),
  z.object(evaluationContent),
])

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

export type SendEmailCampaignInput = z.infer<typeof sendEmailCampaignSchema>
export type PreviewRecipientsInput = z.infer<typeof previewRecipientsSchema>
export type PreviewEmailInput = z.infer<typeof previewEmailSchema>
export type PreviewEvaluationRecipientInput = z.infer<
  typeof previewEvaluationRecipientSchema
>
