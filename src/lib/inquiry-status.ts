export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nova',
  ACCOUNT_CREATED: 'Račun stvoren',
  DECLINED: 'Odbijena',
  PARTY_SCHEDULED: 'Termin dogovoren',
}

export const INQUIRY_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-100 text-amber-800 border-amber-200',
  ACCOUNT_CREATED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  DECLINED: 'bg-gray-100 text-gray-600 border-gray-200',
  PARTY_SCHEDULED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

// Inquiry.type discriminator. Only PARTY renders a badge (COURSE is the
// implicit default and stays unlabeled in the UI).
export const INQUIRY_TYPE_LABELS: Record<string, string> = {
  COURSE: 'Upis',
  PARTY: 'Proslava',
}

export const INQUIRY_TYPE_COLORS: Record<string, string> = {
  COURSE: 'bg-gray-100 text-gray-600 border-gray-200',
  PARTY: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
}

// Label for the derived "returning student" marker (a child whose name + DOB
// already match an existing student). Rendered alongside — not instead of — the
// lifecycle status, since it is orthogonal to NEW / ACCOUNT_CREATED / DECLINED.
export const RETURNING_INQUIRY_LABEL = 'Ponovni upis'

// The parent's answer when none of a program's proposed termini work for them.
// One string for both the public dropdown option and the admin "Željeni termin"
// row, so the admin reads back verbatim what the parent picked.
export const NO_SUITABLE_TERMIN_LABEL = 'Ne odgovara mi predloženi termin'


export const STATUS_FLOW = [
  'NEW',
  'ACCOUNT_CREATED',
] as const

// Canonical grade values for Inquiry.childGrade. Required by the public
// inquiry Zod schema for every flow, including /radionice/{slug}. On
// radionica forms the grade is informational only and does not filter
// group selection. Legacy rows submitted before this normalization may
// still carry the literal string 'workshop' — admin views render those
// via the GRADE_LABELS[v] ?? v fallback.
//
// Split in two because which set a FORM OFFERS is not the same as what the
// column accepts: `/prijava` and the radionica pages stop at 8. razred (the
// programs behind them are osnovnoškolski), while competitors carry on through
// srednja škola. `GRADE_VALUES` is the union — the Zod schema and every admin
// view accept all of them; `submitInquiry` is what enforces that a high-school
// grade only reaches a competition inquiry.
export const ELEMENTARY_GRADE_VALUES = [
  'predskolci',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
] as const

const HIGH_SCHOOL_GRADE_VALUES = ['ss1', 'ss2', 'ss3', 'ss4'] as const

export const GRADE_VALUES = [
  ...ELEMENTARY_GRADE_VALUES,
  ...HIGH_SCHOOL_GRADE_VALUES,
] as const

export type Grade = (typeof GRADE_VALUES)[number]
type HighSchoolGrade = (typeof HIGH_SCHOOL_GRADE_VALUES)[number]

/** True for the four srednja škola grades — offered only on the competition form. */
export function isHighSchoolGrade(value: string): value is HighSchoolGrade {
  return (HIGH_SCHOOL_GRADE_VALUES as readonly string[]).includes(value)
}

export const GRADE_LABELS: Record<Grade, string> = {
  predskolci: 'Predškolci',
  '1': '1. razred',
  '2': '2. razred',
  '3': '3. razred',
  '4': '4. razred',
  '5': '5. razred',
  '6': '6. razred',
  '7': '7. razred',
  '8': '8. razred',
  ss1: 'Srednja škola – 1. razred',
  ss2: 'Srednja škola – 2. razred',
  ss3: 'Srednja škola – 3. razred',
  ss4: 'Srednja škola – 4. razred',
}

export const GRADE_SORT_KEY: Record<Grade, number> = {
  predskolci: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  ss1: 9,
  ss2: 10,
  ss3: 11,
  ss4: 12,
}
