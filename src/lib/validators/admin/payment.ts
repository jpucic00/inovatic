import { z } from 'zod'

export const setModulePaidSchema = z.object({
  moduleEnrollmentId: z.string().min(1),
  paid: z.boolean(),
})

export const setEnrollmentYearPaidSchema = z.object({
  enrollmentId: z.string().min(1),
  paid: z.boolean(),
})
