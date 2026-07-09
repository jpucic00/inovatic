import { z } from 'zod'
import { DAYS_HR } from '@/lib/format'

export const createGroupSchema = z
  .object({
    courseId: z.string().min(1, 'Odaberite program'),
    locationId: z.string().min(1, 'Odaberite lokaciju'),
    name: z.string().min(1, 'Unesite naziv grupe'),
    // Radionice use dateStart + dateEnd as a closed YYYY-MM-DD range
    // (group runs every day in between); standard programs use dayOfWeek.
    dateStart: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum'), z.literal('')]).optional(),
    dateEnd: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum'), z.literal('')]).optional(),
    dayOfWeek: z.union([z.enum(DAYS_HR), z.literal('')]).optional(),
    // Hour may be 1 or 2 digits: the group forms bind these to free-text inputs
    // (placeholder "19:00"), so a morning class typed as "9:00" must be accepted.
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Unesite valjano vrijeme početka (HH:MM)'),
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Unesite valjano vrijeme kraja (HH:MM)'),
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
    dateStart: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum'), z.literal('')]).optional(),
    dateEnd: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum'), z.literal('')]).optional(),
    dayOfWeek: z.union([z.enum(DAYS_HR), z.literal('')]).optional(),
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Unesite valjano vrijeme početka (HH:MM)').optional(),
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Unesite valjano vrijeme kraja (HH:MM)').optional(),
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
