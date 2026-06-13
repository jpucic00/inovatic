import { z } from 'zod'

export const createGroupSchema = z
  .object({
    courseId: z.string().min(1, 'Odaberite program'),
    locationId: z.string().min(1, 'Odaberite lokaciju'),
    name: z.string().min(1, 'Unesite naziv grupe'),
    // Radionice use dateStart + dateEnd as a closed YYYY-MM-DD range
    // (group runs every day in between); standard programs use dayOfWeek.
    dateStart: z.string().optional().or(z.literal('')),
    dateEnd: z.string().optional().or(z.literal('')),
    dayOfWeek: z.string().optional().or(z.literal('')),
    startTime: z.string().min(1, 'Unesite vrijeme početka'),
    endTime: z.string().min(1, 'Unesite vrijeme kraja'),
    maxStudents: z.coerce.number().int().min(1).max(50),
    teacherIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = !!data.dateStart
    const hasEnd = !!data.dateEnd
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasStart ? 'dateEnd' : 'dateStart'],
        message: 'Unesite oba datuma (početak i kraj).',
      })
      return
    }
    if (hasStart && hasEnd && data.dateEnd! < data.dateStart!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateEnd'],
        message: 'Kraj ne smije biti prije početka.',
      })
    }
  })

export const updateGroupSchema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1, 'Odaberite program').optional(),
    locationId: z.string().min(1, 'Odaberite lokaciju').optional(),
    name: z.string().min(1, 'Unesite naziv grupe').optional(),
    dateStart: z.string().optional().or(z.literal('')),
    dateEnd: z.string().optional().or(z.literal('')),
    dayOfWeek: z.string().optional().or(z.literal('')),
    startTime: z.string().min(1, 'Unesite vrijeme početka').optional(),
    endTime: z.string().min(1, 'Unesite vrijeme kraja').optional(),
    maxStudents: z.coerce.number().int().min(1).max(50).optional(),
    teacherIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = !!data.dateStart
    const hasEnd = !!data.dateEnd
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasStart ? 'dateEnd' : 'dateStart'],
        message: 'Unesite oba datuma (početak i kraj).',
      })
      return
    }
    if (hasStart && hasEnd && data.dateEnd! < data.dateStart!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateEnd'],
        message: 'Kraj ne smije biti prije početka.',
      })
    }
  })

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
