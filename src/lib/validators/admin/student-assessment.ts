import { z } from 'zod'

const skillLevelSchema = z.enum(['POCETNO', 'U_RAZVOJU', 'OSTVARENO'])

const recommendationKindSchema = z.enum([
  'COURSE',
  'COMPETITION_PREP',
  'COMPETITION_PROGRAM',
])

export const upsertAssessmentSchema = z
  .object({
    studentId: z.string().min(1),
    groupId: z.string().min(1),
    slaganje: skillLevelSchema.nullish(),
    programiranje: skillLevelSchema.nullish(),
    inovacije: skillLevelSchema.nullish(),
    suradnja: skillLevelSchema.nullish(),
    komunikacija: skillLevelSchema.nullish(),
    zabava: skillLevelSchema.nullish(),
    opisnaOcjena: z.string().max(5000).nullish(),
    recommendationKind: recommendationKindSchema.nullish(),
    recommendedCourseId: z.string().min(1).nullish(),
  })
  // A COURSE recommendation requires a courseId; any other kind (or none) must
  // not carry one. Keeps the discriminated (kind, courseId) pair consistent.
  .refine(
    (d) =>
      d.recommendationKind === 'COURSE'
        ? !!d.recommendedCourseId
        : !d.recommendedCourseId,
    {
      message: 'Preporuka nije ispravno postavljena.',
      path: ['recommendedCourseId'],
    },
  )

export type AssessmentInput = z.infer<typeof upsertAssessmentSchema>

export const clearAssessmentSchema = z.object({
  studentId: z.string().min(1),
  groupId: z.string().min(1),
})
