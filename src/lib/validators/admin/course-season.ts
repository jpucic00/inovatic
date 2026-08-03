import { z } from 'zod'

// '' is a legitimate value: the editor submits it for a cleared date and the
// action maps it to NULL (season bound removed).
const seasonDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum mora biti u formatu YYYY-MM-DD.'),
    z.literal(''),
  ])
  .nullable()
  .optional()

export const upsertCourseSeasonSchema = z.object({
  courseId: z.string().min(1, 'Nevaljani podaci.'),
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
  startDate: seasonDate,
  endDate: seasonDate,
})

export type UpsertCourseSeasonInput = z.infer<typeof upsertCourseSeasonSchema>
