import { z } from 'zod'

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

// "Ugovor potpisan" is not a payment, but it is the same shape and the same
// per-enrollment grain, and it is read on the same card — so it shares this
// module rather than growing a validator file of its own.
export const setEnrollmentContractSignedSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  signed: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})
