import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum mora biti u formatu YYYY-MM-DD.')

/**
 * Unlike `upsertCourseSeason`, both dates are REQUIRED here: a half-set trial
 * week is not a trial week, and "no probni sat this year" is expressed by the
 * row's absence (`clearTrialWeek`), not by a null bound.
 */
export const upsertTrialWeekSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
  startDate: isoDate,
  endDate: isoDate,
})

export const clearTrialWeekSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Neispravna školska godina.'),
})

export type UpsertTrialWeekInput = z.infer<typeof upsertTrialWeekSchema>
export type ClearTrialWeekInput = z.infer<typeof clearTrialWeekSchema>
