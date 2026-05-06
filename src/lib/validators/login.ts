import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Unesite korisničko ime ili e-mail'),
  password: z.string().min(1, 'Unesite lozinku'),
})

export type LoginFormData = z.infer<typeof loginSchema>
