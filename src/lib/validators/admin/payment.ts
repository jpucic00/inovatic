import { z } from 'zod'

export const setModulePaidSchema = z.object({
  moduleEnrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  paid: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})

export const setEnrollmentYearPaidSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  paid: z.boolean({ invalid_type_error: 'Nevaljani podaci.', required_error: 'Nevaljani podaci.' }),
})
