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
  // Editable: the e-mail is the teacher's login identity. Uniqueness is
  // enforced in the action (a collision with another account is rejected).
  email: z.string().email(),
  phone: z.string().optional().nullable(),
})

export const assignTeacherSchema = z.object({
  teacherId: z.string().min(1),
  scheduledGroupId: z.string().min(1),
})

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>
