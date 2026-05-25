import { z } from 'zod'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Input for `completeSchoolYearPlan` — admin commits the planner preview to
 * ModuleSchedule rows for every standard program. Both fields come from the
 * client without any extra wrapping (no confirmation flag — the action's own
 * pre-flight guard refuses if any standard module date already exists).
 */
export const completeSchoolYearPlanSchema = z.object({
  schoolYear: z.string().regex(SCHOOL_YEAR_RE, 'Nevažeća školska godina.'),
  startDate: z.string().regex(DATE_KEY_RE, 'Datum mora biti u formatu YYYY-MM-DD.'),
})

export type CompleteSchoolYearPlanInput = z.infer<typeof completeSchoolYearPlanSchema>
