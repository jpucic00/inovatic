import { z } from 'zod'

export const createGroupSchema = z.object({
  courseId: z.string().min(1, 'Odaberite program'),
  locationId: z.string().min(1, 'Odaberite lokaciju'),
  name: z.string().optional().or(z.literal('')),
  dayOfWeek: z.string().optional().or(z.literal('')),
  startTime: z.string().optional().or(z.literal('')),
  endTime: z.string().optional().or(z.literal('')),
  schoolYear: z.string().optional().or(z.literal('')),
  maxStudents: z.coerce.number().int().min(1).max(50).default(12),
  enrollmentStart: z.string().optional().or(z.literal('')),
  enrollmentEnd: z.string().optional().or(z.literal('')),
})

export const updateGroupSchema = createGroupSchema.partial().extend({
  id: z.string().min(1),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
