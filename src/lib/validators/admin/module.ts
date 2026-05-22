import { z } from 'zod'

export const upsertModuleScheduleSchema = z.object({
  moduleId: z.string().min(1),
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

export type UpsertModuleScheduleInput = z.infer<typeof upsertModuleScheduleSchema>
