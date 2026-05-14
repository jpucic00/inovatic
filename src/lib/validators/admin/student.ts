import { z } from 'zod'

export const createStudentSchema = z.object({
  inquiryId: z.string().min(1),
  groupId: z.string().min(1),
})

export const createStudentManuallySchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  dateOfBirth: z.string().optional().nullable(),
  parentName: z.string().optional().nullable(),
  parentEmail: z
    .union([z.literal(''), z.string().email()])
    .optional()
    .nullable(),
  parentPhone: z.string().optional().nullable(),
  childSchool: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  moduleScheduleIds: z.array(z.string()).optional(),
})

export const addEnrollmentSchema = z.object({
  studentId: z.string().min(1),
  groupId: z.string().min(1),
  moduleScheduleIds: z.array(z.string()).optional(),
})

export type CreateStudentManuallyInput = z.infer<typeof createStudentManuallySchema>
export type AddEnrollmentInput = z.infer<typeof addEnrollmentSchema>
