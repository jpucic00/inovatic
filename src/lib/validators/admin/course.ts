import { z } from 'zod'

export const createCourseSchema = z.object({
  title: z.string().min(2, 'Naziv mora imati najmanje 2 znaka'),
  description: z.string().min(5, 'Opis mora imati najmanje 5 znakova'),
  ageMin: z.coerce.number().int().min(3).max(18),
  ageMax: z.coerce.number().int().min(3).max(18),
  equipment: z.string().min(1, 'Oprema je obavezna'),
  priceYear: z.coerce.number().optional(),
  priceModule: z.coerce.number().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
})

export const updateCourseSchema = createCourseSchema.partial().extend({
  id: z.string().min(1),
})

export type CreateCourseInput = z.infer<typeof createCourseSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>
