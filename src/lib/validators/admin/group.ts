import { z } from 'zod'
import { DAYS_HR } from '@/lib/format'

/**
 * The time regex allows one or two hour digits — '9:00' and '09:00' both occur
 * in real input — so string comparison is wrong ('9:00' > '18:00'). Compare
 * minutes since midnight instead.
 */
function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/**
 * Shared by create and update: the date pair must be complete and ordered, and
 * the session must have positive length.
 *
 * An equal or inverted time range used to save happily and then crash
 * `/admin/grupe` outright — `buildTimeBands` produced no bands and the grid
 * indexed past the end of the list. That crash is now guarded defensively in
 * `weekly-schedule.tsx`; this is the other half, keeping the bad row out of the
 * database in the first place.
 */
function refineGroupWindow(
  data: Readonly<{
    dateStart?: string
    dateEnd?: string
    startTime?: string
    endTime?: string
  }>,
  ctx: z.RefinementCtx,
): void {
  const hasStart = !!data.dateStart
  const hasEnd = !!data.dateEnd
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasStart ? 'dateEnd' : 'dateStart'],
      message: 'Unesite oba datuma (početak i kraj).',
    })
  } else if (hasStart && hasEnd && data.dateEnd! < data.dateStart!) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateEnd'],
      message: 'Kraj ne smije biti prije početka.',
    })
  }

  // Runs regardless of the date branch above — a broken date pair and a broken
  // time range are independent problems, and the admin should see both at once.
  if (
    data.startTime &&
    data.endTime &&
    toMinutes(data.endTime) <= toMinutes(data.startTime)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'Kraj termina mora biti nakon početka.',
    })
  }
}

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
  .superRefine(refineGroupWindow)

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
  .superRefine(refineGroupWindow)

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
