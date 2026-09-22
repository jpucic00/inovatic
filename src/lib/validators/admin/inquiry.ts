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

// Lista čekanja entry: the groups the family CAN attend plus a free-text note.
// An entry with neither says nothing about what the family is waiting for.
export const waitlistInquirySchema = z
  .object({
    id: z.string().min(1),
    groupIds: z
      .array(z.string().min(1))
      .max(20, 'Odaberite najviše 20 grupa.')
      .transform((ids) => [...new Set(ids)]),
    note: z
      .string()
      .trim()
      .max(1000, 'Maksimalno 1000 znakova.')
      .transform((v) => v || null),
  })
  .refine((v) => v.groupIds.length > 0 || v.note !== null, {
    message: 'Odaberite barem jednu grupu ili upišite napomenu.',
    path: ['groupIds'],
  })

export type WaitlistInquiryInput = z.input<typeof waitlistInquirySchema>
