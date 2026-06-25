import { z } from 'zod'
import { fromDateKey, toDateKey } from '@/lib/session-dates'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 366

/**
 * A YYYY-MM-DD key that survives a fromDateKey→toDateKey round-trip — i.e. a
 * real calendar date. Impossible dates like `2026-02-31` fail because
 * fromDateKey rolls them forward (into March), so the key no longer matches.
 */
function isRealDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return true // shape error already reported by the field
  return toDateKey(fromDateKey(key)) === key
}

/** Inside the school-year window: Sept 1 (first year) → Aug 31 (second year). */
function inSchoolYear(key: string, schoolYear: string): boolean {
  const m = /^(\d{4})\/(\d{4})$/.exec(schoolYear)
  if (!m || !DATE_KEY_RE.test(key)) return true // shape error already reported
  return key >= `${m[1]}-09-01` && key <= `${m[2]}-08-31`
}

/** Inclusive day span of [startKey, endKey] — both must be real, ordered keys. */
function rangeDays(startKey: string, endKey: string): number {
  return Math.round((fromDateKey(endKey).getTime() - fromDateKey(startKey).getTime()) / 86_400_000) + 1
}

/** Real-calendar-date + inside-school-year checks for a single date key. */
function checkDateKey(
  ctx: z.RefinementCtx,
  key: string,
  schoolYear: string,
  path: (string | number)[],
): void {
  if (!isRealDateKey(key)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Datum ne postoji u kalendaru.', path })
    return
  }
  if (!inSchoolYear(key, schoolYear)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Datum mora biti unutar odabrane školske godine.',
      path,
    })
  }
}

/** Cap a [startKey, endKey] block at MAX_RANGE_DAYS (only once both are valid). */
function checkRangeLength(
  ctx: z.RefinementCtx,
  startKey: string,
  endKey: string,
  path: (string | number)[],
): void {
  if (!isRealDateKey(startKey) || !isRealDateKey(endKey) || endKey < startKey) return
  if (rangeDays(startKey, endKey) > MAX_RANGE_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Raspon ne smije biti dulji od ${MAX_RANGE_DAYS} dana.`,
      path,
    })
  }
}

export const upsertHolidaySchema = z
  .object({
    schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
    date: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
    name: z.string().trim().max(100, 'Naziv može imati najviše 100 znakova.').optional().or(z.literal('')),
    confirmDeleteAttendance: z.boolean().optional(),
  })
  .superRefine((d, ctx) => checkDateKey(ctx, d.date, d.schoolYear, ['date']))

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
  .superRefine((d, ctx) => {
    checkDateKey(ctx, d.startDate, d.schoolYear, ['startDate'])
    checkDateKey(ctx, d.endDate, d.schoolYear, ['endDate'])
    checkRangeLength(ctx, d.startDate, d.endDate, ['endDate'])
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

export const bulkImportHolidaysSchema = z
  .object({
    schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
    items: z.array(importItemSchema).min(1, 'Odaberite barem jedan praznik.'),
    confirmDeleteAttendance: z.boolean().optional(),
  })
  // Object-level so per-item date checks can see the parent `schoolYear` window.
  .superRefine((data, ctx) => {
    data.items.forEach((item, idx) => {
      if (item.kind === 'single') {
        checkDateKey(ctx, item.date, data.schoolYear, ['items', idx, 'date'])
        return
      }
      if (item.endDate < item.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Kraj raspona mora biti isti ili nakon početka.',
          path: ['items', idx, 'endDate'],
        })
      }
      checkDateKey(ctx, item.startDate, data.schoolYear, ['items', idx, 'startDate'])
      checkDateKey(ctx, item.endDate, data.schoolYear, ['items', idx, 'endDate'])
      checkRangeLength(ctx, item.startDate, item.endDate, ['items', idx, 'endDate'])
    })
  })

export type UpsertHolidayInput = z.infer<typeof upsertHolidaySchema>
export type RemoveHolidayInput = z.infer<typeof removeHolidaySchema>
export type UpsertHolidayRangeInput = z.infer<typeof upsertHolidayRangeSchema>
export type RemoveHolidayRangeInput = z.infer<typeof removeHolidayRangeSchema>
export type BulkImportHolidaysInput = z.infer<typeof bulkImportHolidaysSchema>
export type BulkImportHolidayItem = z.infer<typeof importItemSchema>
