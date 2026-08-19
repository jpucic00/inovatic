import { z } from 'zod'
import { PAYMENT_OPTION_VALUES } from '@/lib/payment-option'

export const setModulePaidSchema = z.object({
  moduleEnrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  paid: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})

export const setEnrollmentYearPaidSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  paid: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})

export const setEnrollmentMonthPaidSchema = z.object({
  enrollmentMonthId: z.string().min(1, 'Nevaljani podaci.'),
  paid: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})

/**
 * How this family settles this enrollment. Not a mark like the three above — it
 * is a choice with a third state, "nije odabrano", so the empty `''` the select
 * submits is accepted here and normalized to null by the action (the same way
 * `updateTeacherHourlyRate` treats a blanked rate: clearing must actually clear,
 * not fail validation and leave the old value standing).
 *
 * Written as a union rather than a `preprocess`/`transform` so the schema's
 * input and output types stay identical — `adminAction` takes a `ZodSchema<T>`,
 * which cannot express a schema that reshapes its input.
 */
export const setEnrollmentPaymentOptionSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  option: z.union([z.enum(PAYMENT_OPTION_VALUES), z.literal('')]).nullable(),
})

// "Ugovor potpisan" is not a payment, but it is the same shape and the same
// per-enrollment grain, and it is read on the same card — so it shares this
// module rather than growing a validator file of its own.
export const setEnrollmentContractSignedSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  signed: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})
