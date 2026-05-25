import { z } from 'zod'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export const upsertHolidaySchema = z.object({
  schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
  date: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
  name: z.string().trim().max(100, 'Naziv može imati najviše 100 znakova.').optional().or(z.literal('')),
  confirmDeleteAttendance: z.boolean().optional(),
})

export const removeHolidaySchema = z.object({
  id: z.string().min(1, 'ID je obavezan.'),
})

export const removeHolidayRangeSchema = z
  .object({
    schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
    startDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
    endDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Kraj raspona mora biti isti ili nakon početka.',
    path: ['endDate'],
  })

export const upsertHolidayRangeSchema = z
  .object({
    schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
    startDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
    endDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
    name: z.string().trim().max(100, 'Naziv može imati najviše 100 znakova.').optional().or(z.literal('')),
    confirmDeleteAttendance: z.boolean().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Kraj raspona mora biti isti ili nakon početka.',
    path: ['endDate'],
  })

const importSingleSchema = z.object({
  kind: z.literal('single'),
  date: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
  name: z
    .string()
    .trim()
    .min(1, 'Naziv praznika je obavezan.')
    .max(100, 'Naziv može imati najviše 100 znakova.'),
})

const importRangeSchema = z.object({
  kind: z.literal('range'),
  startDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
  endDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
  name: z
    .string()
    .trim()
    .min(1, 'Naziv praznika je obavezan.')
    .max(100, 'Naziv može imati najviše 100 znakova.'),
})

const importItemSchema = z.discriminatedUnion('kind', [importSingleSchema, importRangeSchema])

export const bulkImportHolidaysSchema = z.object({
  schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
  items: z
    .array(importItemSchema)
    .min(1, 'Odaberite barem jedan praznik.')
    .superRefine((items, ctx) => {
      items.forEach((item, idx) => {
        if (item.kind === 'range' && item.endDate < item.startDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Kraj raspona mora biti isti ili nakon početka.',
            path: [idx, 'endDate'],
          })
        }
      })
    }),
  confirmDeleteAttendance: z.boolean().optional(),
})

export type UpsertHolidayInput = z.infer<typeof upsertHolidaySchema>
export type RemoveHolidayInput = z.infer<typeof removeHolidaySchema>
export type UpsertHolidayRangeInput = z.infer<typeof upsertHolidayRangeSchema>
export type RemoveHolidayRangeInput = z.infer<typeof removeHolidayRangeSchema>
export type BulkImportHolidaysInput = z.infer<typeof bulkImportHolidaysSchema>
export type BulkImportHolidayItem = z.infer<typeof importItemSchema>
