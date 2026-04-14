import { z } from 'zod'

export const createGroupSchema = z.object({
  courseId: z.string().min(1, 'Odaberite program'),
  locationId: z.string().min(1, 'Odaberite lokaciju'),
  name: z.string().min(1, 'Unesite naziv grupe'),
  date: z.string().optional().or(z.literal('')),
  dayOfWeek: z.string().optional().or(z.literal('')),
  startTime: z.string().min(1, 'Unesite vrijeme početka'),
  endTime: z.string().min(1, 'Unesite vrijeme kraja'),
  schoolYear: z.string().min(1, 'Unesite školsku godinu'),
  maxStudents: z.coerce.number().int().min(1).max(50),
  enrollmentStart: z.string().optional().or(z.literal('')),
  enrollmentEnd: z.string().optional().or(z.literal('')),
})

export const updateGroupSchema = createGroupSchema.partial().extend({
  id: z.string().min(1),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
