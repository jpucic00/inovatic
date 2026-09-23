import { z } from 'zod'
import { fromDateKey, toDateKey } from '@/lib/session-dates'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

// A real calendar date only: fromDateKey rolls 2026-02-31 over to 2026-03-03,
// so the round-trip is what stops a stored date differing from the checked one.
const sessionDateSchema = z
  .string()
  .refine(
    (key) => DATE_KEY_RE.test(key) && toDateKey(fromDateKey(key)) === key,
    'Neispravan datum termina.',
  )

const roleSchema = z.enum(['LEAD', 'ASSISTANT'], {
  errorMap: () => ({ message: 'Odaberite ulogu.' }),
})

export const setAssignmentRoleSchema = z.object({
  assignmentId: z.string().min(1),
  role: roleSchema,
})

export const addSessionStaffChangeSchema = z.object({
  scheduledGroupId: z.string().min(1),
  // One change row per date; an admin covers a whole run of termini at once.
  sessionDates: z
    .array(sessionDateSchema)
    .min(1, 'Odaberite barem jedan termin.')
    .max(60, 'Previše termina odjednom.')
    .transform((d) => [...new Set(d)].sort((a, b) => a.localeCompare(b))),
  userId: z.string().min(1, 'Odaberite nastavnika.'),
  role: roleSchema,
  // '' from the "Dodatno na terminu" option means nobody is being replaced.
  replacesUserId: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().min(1).nullable(),
  ),
})

export type SetAssignmentRoleInput = z.infer<typeof setAssignmentRoleSchema>
export type AddSessionStaffChangeInput = z.input<typeof addSessionStaffChangeSchema>
