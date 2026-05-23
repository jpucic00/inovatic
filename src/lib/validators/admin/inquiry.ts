import { z } from 'zod'

export const declineInquirySchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, 'Razlog je obavezan.')
    .max(2000, 'Maksimalno 2000 znakova.'),
})
