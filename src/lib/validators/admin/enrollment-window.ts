import { z } from 'zod'

/**
 * Upsert the public signup window for a program in a given school year.
 * Both dates are optional but must be provided together (a window is a concrete
 * from–to period); clearing both closes signups. End must not precede start.
 */
export const upsertEnrollmentWindowSchema = z
  .object({
    courseId: z.string().min(1, 'Nevaljani podaci.'),
    schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
    enrollmentStart: z.string().optional().or(z.literal('')),
    enrollmentEnd: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const hasStart = !!data.enrollmentStart
    const hasEnd = !!data.enrollmentEnd
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasStart ? 'enrollmentEnd' : 'enrollmentStart'],
        message: 'Unesite oba datuma (početak i kraj) ili oba ostavite prazna.',
      })
      return
    }
    if (hasStart && hasEnd && data.enrollmentEnd! < data.enrollmentStart!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['enrollmentEnd'],
        message: 'Kraj ne smije biti prije početka.',
      })
    }
  })

export type UpsertEnrollmentWindowInput = z.infer<typeof upsertEnrollmentWindowSchema>
