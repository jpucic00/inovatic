import { z } from 'zod'

export const declineInquirySchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, 'Razlog je obavezan.')
    .max(2000, 'Maksimalno 2000 znakova.'),
})

// Admin scheduling of a PARTY inquiry: the agreed date + "HH:mm" start time.
export const schedulePartySchema = z.object({
  id: z.string().min(1),
  confirmedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Odaberite datum proslave.'),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Unesite vrijeme (HH:mm).'),
})

export type SchedulePartyInput = z.infer<typeof schedulePartySchema>
