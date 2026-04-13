import { z } from 'zod'

export const createStudentSchema = z.object({
  inquiryId: z.string().min(1),
  groupId: z.string().min(1),
})

export const studentFiltersSchema = z.object({
  search: z.string().optional(),
  courseId: z.string().optional(),
  groupId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateStudentInput = z.infer<typeof createStudentSchema>
export type StudentFiltersInput = z.infer<typeof studentFiltersSchema>
