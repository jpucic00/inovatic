import { z } from 'zod'

export const createStudentSchema = z.object({
  inquiryId: z.string().min(1),
  groupId: z.string().min(1),
})

export const createStudentManuallySchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  // Required: DOB is the disambiguator that makes returning-student detection
  // reliable, so every student record must carry one.
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Unesite datum rođenja (GGGG-MM-DD)'),
  parentName: z.string().optional().nullable(),
  // Required alongside DOB: the credentials recipient AND the legacy-tier
  // matcher that recognizes DOB-less imported students by name + email.
  parentEmail: z.string().trim().email('Unesite valjanu email adresu'),
  parentPhone: z.string().optional().nullable(),
  childSchool: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  moduleScheduleIds: z.array(z.string()).optional(),
})

// Admin-only edit of an existing student's child + parent data from the
// profile page. Mirrors the create schema's field rules; `id` targets the row.
export const updateStudentSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Unesite datum rođenja (GGGG-MM-DD)'),
  childSchool: z.string().optional().nullable(),
  parentName: z.string().optional().nullable(),
  parentEmail: z
    .union([z.literal(''), z.string().email()])
    .optional()
    .nullable(),
  parentPhone: z.string().optional().nullable(),
})

export const addEnrollmentSchema = z.object({
  studentId: z.string().min(1),
  groupId: z.string().min(1),
  moduleScheduleIds: z.array(z.string()).optional(),
})

export type CreateStudentManuallyInput = z.infer<typeof createStudentManuallySchema>
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>
export type AddEnrollmentInput = z.infer<typeof addEnrollmentSchema>
