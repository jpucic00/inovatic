import { z } from 'zod'

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum mora biti u formatu YYYY-MM-DD.')

const note = z
  .union([z.literal(''), z.string().max(500)])
  .optional()
  .nullable()

export const bulkMarkSessionSchema = z.object({
  groupId: z.string().min(1),
  sessionDate: dateKey,
  entries: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        present: z.boolean(),
        note,
      }),
    )
    .min(1, 'Unesite barem jedan zapis.'),
  // Teaching hours. Omitted by a group with a single teacher — the server fills
  // that one in automatically; with 2+ teachers the marker sends them all.
  teacherEntries: z
    .array(
      z.object({
        userId: z.string().min(1),
        present: z.boolean(),
      }),
    )
    .optional(),
})

export type BulkMarkSessionInput = z.infer<typeof bulkMarkSessionSchema>
