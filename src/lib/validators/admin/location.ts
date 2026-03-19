import { z } from 'zod'

export const createLocationSchema = z.object({
  name: z.string().min(2, 'Naziv mora imati najmanje 2 znaka'),
  address: z.string().min(5, 'Adresa mora imati najmanje 5 znakova'),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Neispravna email adresa').optional().or(z.literal('')),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
})

export const updateLocationSchema = createLocationSchema.partial().extend({
  id: z.string().min(1),
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
