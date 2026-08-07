import { z } from 'zod'

export const createCourseSchema = z.object({
  title: z.string().min(2, 'Naziv mora imati najmanje 2 znaka'),
  description: z.string().min(5, 'Opis mora imati najmanje 5 znakova'),
  // Upper bound is 19, not 18: the natjecateljski program keeps competitors
  // through secondary school (its signup link offers grades ss1–ss4), and a
  // 4th-year student turns 19 during the school year.
  ageMin: z.coerce.number().int().min(3).max(19),
  ageMax: z.coerce.number().int().min(3).max(19),
  // A blank number input arrives as '' — coercion would turn it into 0 and
  // trip .positive(), so blanks become undefined before the optional gate.
  // Price is genuinely optional: a radionica may be free or priced later.
  price: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().positive('Cijena mora biti veća od 0').optional(),
  ),
  imageUrl: z.string().url().optional().or(z.literal('')),
})

// Editing never touches the slug (the shared public /radionice/<slug> URL) or
// imageUrl (not exposed in the form — omitted so it is never blanked).
export const updateCourseSchema = createCourseSchema
  .omit({ imageUrl: true })
  .extend({ id: z.string().min(1, 'ID nije pronađen.') })

export type CreateCourseInput = z.infer<typeof createCourseSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>
