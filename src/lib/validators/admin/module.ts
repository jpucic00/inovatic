import { z } from 'zod'

export const updateModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2, 'Naziv mora imati najmanje 2 znaka').optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

export type UpdateModuleInput = z.infer<typeof updateModuleSchema>
