import { z } from 'zod'

export const createTeacherSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional().nullable(),
})

export const updateTeacherSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  // Editable: the e-mail is the teacher's login identity. Uniqueness is
  // enforced in the action (a collision with another account is rejected).
  email: z.string().email(),
  phone: z.string().optional().nullable(),
})

export const assignTeacherSchema = z.object({
  teacherId: z.string().min(1),
  scheduledGroupId: z.string().min(1),
})

/**
 * The payout rate, taken as the admin typed it and converted here — the client
 * never computes cents. A blank input is not an error but the way to *clear* a
 * rate, so it becomes null rather than 0: "not set" and "works for free" are
 * different states, and only the first one hides the money column. A Croatian
 * keyboard produces "12,50", so both separators are accepted.
 */
export const updateTeacherHourlyRateSchema = z.object({
  id: z.string().min(1),
  hourlyRateCents: z.preprocess(
    (v) => {
      if (v === null || v === undefined) return null
      // Only primitives stringify meaningfully — an object would coerce to
      // '[object Object]', which reads as garbage below anyway.
      if (typeof v !== 'string' && typeof v !== 'number') return Number.NaN
      const raw = String(v).trim().replace(',', '.')
      if (raw === '') return null
      const euros = Number(raw)
      // NaN survives to the schema below and is rejected there — coercing it to
      // null here would silently wipe a rate on a typo.
      return Number.isFinite(euros) ? Math.round(euros * 100) : Number.NaN
    },
    z
      .number({ invalid_type_error: 'Satnica mora biti broj.' })
      .int()
      .min(0, 'Satnica ne može biti negativna.')
      // 1000 €/h is far past any real rate — a stray keystroke, not a raise.
      .max(100_000, 'Satnica je prevelika.')
      .nullable(),
  ),
})

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>
/** `hourlyRateCents` is what the form typed (a string) on the way in, cents on the way out. */
export type UpdateTeacherHourlyRateInput = z.input<typeof updateTeacherHourlyRateSchema>
