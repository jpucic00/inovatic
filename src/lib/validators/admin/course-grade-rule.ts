import { z } from 'zod'
import { ELEMENTARY_GRADE_VALUES } from '@/lib/inquiry-status'

/**
 * Save which razredi a standard program is offered to, for one school year (the
 * admin's own city is taken from the session, never from this payload).
 *
 * The list may be EMPTY — that is the explicit "offered to nobody", which is
 * how a city retires a program from the public form without deleting anything.
 * Only osnovna škola grades are accepted: the srednjoškolski ones exist for the
 * competitive program, which is never narrowed by razred.
 */
export const upsertCourseGradeRuleSchema = z.object({
  courseId: z.string().min(1, 'Nevaljani podaci.'),
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
  grades: z
    .array(
      z.enum(ELEMENTARY_GRADE_VALUES, {
        errorMap: () => ({ message: 'Nepoznat razred.' }),
      }),
    )
    .refine((g) => new Set(g).size === g.length, 'Razred je naveden više puta.'),
})

export type UpsertCourseGradeRuleInput = z.infer<typeof upsertCourseGradeRuleSchema>

/** Drop the override so the program falls back to the default razred ladder. */
export const resetCourseGradeRuleSchema = upsertCourseGradeRuleSchema.omit({ grades: true })

export type ResetCourseGradeRuleInput = z.infer<typeof resetCourseGradeRuleSchema>
