import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Unesite email adresu').email('Unesite valjanu email adresu'),
  password: z.string().min(1, 'Unesite lozinku'),
})

export type LoginFormData = z.infer<typeof loginSchema>
