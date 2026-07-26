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
  sourceGroupIds: z.array(z.string().min(1)).max(100, 'Najviše 100 grupa.').optional(),
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
  value: { sourceGroupIds?: string[]; recommendations?: unknown[] },
  ctx: z.RefinementCtx,
) {
  const hasGroups = (value.sourceGroupIds?.length ?? 0) > 0
  const hasRecommendations = (value.recommendations?.length ?? 0) > 0
  if (hasGroups === hasRecommendations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Odaberite grupe ili preporuku.',
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

const customContent = {
  kind: z.literal('CUSTOM'),
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
  ])
  .superRefine(requireExactlyOneSelection)

// The step-2 live recipient resolution; targetCourseId lets the invitation
// kind compute its "već poslano" skip-set alongside the cohort.
export const previewRecipientsSchema = z
  .object({
    kind: z.enum(['CUSTOM', 'REENROLLMENT']),
    ...selectionFields,
    targetCourseId: z.string().min(1).optional(),
  })
  .superRefine(requireExactlyOneSelection)

// The step-1 email preview needs content only — no cohort yet.
export const previewEmailSchema = z.discriminatedUnion('kind', [
  z.object(customContent),
  z.object(reenrollmentContent),
])

export type SendEmailCampaignInput = z.infer<typeof sendEmailCampaignSchema>
export type PreviewRecipientsInput = z.infer<typeof previewRecipientsSchema>
export type PreviewEmailInput = z.infer<typeof previewEmailSchema>
