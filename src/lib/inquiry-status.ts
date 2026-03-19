export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nova',
  SCHEDULE_SENT: 'Raspored poslan',
  CONFIRMED: 'Potvrđena',
  ACCOUNT_CREATED: 'Račun stvoren',
  DECLINED: 'Odbijena',
}

export const INQUIRY_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-100 text-amber-800 border-amber-200',
  SCHEDULE_SENT: 'bg-blue-100 text-blue-800 border-blue-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
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
  'SCHEDULE_SENT',
  'CONFIRMED',
  'ACCOUNT_CREATED',
] as const
