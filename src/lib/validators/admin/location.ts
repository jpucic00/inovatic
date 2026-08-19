import { z } from 'zod'

export const createLocationSchema = z.object({
  name: z.string().min(2, 'Naziv mora imati najmanje 2 znaka'),
  address: z.string().min(5, 'Adresa mora imati najmanje 5 znakova'),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Neispravna email adresa').optional().or(z.literal('')),
})

// Editing never touches `city`: the tenant boundary comes from the session, and
// ScheduledGroup(locationId, city) references Location(id, city) through a
// composite FK — moving a venue between cities would tear its groups off it.
export const updateLocationSchema = createLocationSchema.extend({
  id: z.string().min(1, 'ID nije pronađen.'),
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
