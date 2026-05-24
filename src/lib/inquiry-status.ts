export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nova',
  ACCOUNT_CREATED: 'Račun stvoren',
  DECLINED: 'Odbijena',
}

export const INQUIRY_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-100 text-amber-800 border-amber-200',
  ACCOUNT_CREATED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  DECLINED: 'bg-gray-100 text-gray-600 border-gray-200',
}

export const COURSE_LEVEL_LABELS: Record<string, string> = {
  SLR_1: 'SLR 1',
  SLR_2: 'SLR 2',
  SLR_3: 'SLR 3',
  SLR_4: 'SLR 4',
}

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
export const GRADE_VALUES = [
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

export type Grade = (typeof GRADE_VALUES)[number]

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
}
