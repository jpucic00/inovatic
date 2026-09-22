import { z } from 'zod'

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
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1, 'Odaberite barem jedan termin.')
    .max(60, 'Previše termina odjednom.')
    .transform((d) => [...new Set(d)].sort()),
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
