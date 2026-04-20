import { z } from 'zod'

export const createTeacherSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional().nullable(),
})

export const updateTeacherSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional().nullable(),
})

export const assignTeacherSchema = z.object({
  teacherId: z.string().min(1),
  scheduledGroupId: z.string().min(1),
})

export const teacherFiltersSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>
export type TeacherFiltersInput = z.infer<typeof teacherFiltersSchema>
