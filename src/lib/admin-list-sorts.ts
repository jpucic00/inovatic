/**
 * The sortable columns of the paginated admin lists and the value each one
 * sorts by. The server sorts with these (`getStudents`, `getInquiries`) and the
 * table reads the key lists to know which headers are clickable, so a column
 * cannot be sortable in the UI and ignored by the query.
 */
import { formatChildName } from '@/lib/format'
import { GRADE_SORT_KEY, INQUIRY_STATUS_LABELS, type Grade } from '@/lib/inquiry-status'
import { PAYMENT_STATUS_SORT_KEY, type PaymentStatus } from '@/lib/payment-status'
import type { SortValue } from '@/lib/list-sort'

export const STUDENT_SORT_KEYS = ['name', 'dateOfBirth', 'returning', 'payment', 'createdAt'] as const
export type StudentSortKey = (typeof STUDENT_SORT_KEYS)[number]

type StudentSortFields = {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  createdAt: Date
  isReturning: boolean
  paymentStatus: PaymentStatus
}

export function studentSortValue(key: StudentSortKey, row: StudentSortFields): SortValue {
  switch (key) {
    case 'name':
      return `${row.firstName} ${row.lastName}`
    case 'dateOfBirth':
      return row.dateOfBirth ?? ''
    case 'returning':
      // Descending puts the returning kids on top, which is the way this column
      // gets read — the filter is for extracting them, the sort for spotting them.
      return row.isReturning ? 1 : 0
    case 'payment':
      return PAYMENT_STATUS_SORT_KEY[row.paymentStatus]
    case 'createdAt':
      return row.createdAt.getTime()
  }
}

export const INQUIRY_SORT_KEYS = ['createdAt', 'parentName', 'childName', 'childGrade', 'status'] as const
export type InquirySortKey = (typeof INQUIRY_SORT_KEYS)[number]

type InquirySortFields = {
  type: string
  parentName: string
  childFirstName: string | null
  childLastName: string | null
  childGrade: string | null
  status: string
  createdAt: Date
}

export function inquirySortValue(key: InquirySortKey, row: InquirySortFields): SortValue {
  switch (key) {
    case 'createdAt':
      return row.createdAt.getTime()
    case 'parentName':
      return row.parentName
    case 'childName':
      // A proslava has no child; it sorts after every name. U+FFFF carries the
      // highest collation weight, so it also lands after Ž, which 'zzz' did not.
      return row.type === 'PARTY' ? '\uFFFF' : formatChildName(row, '')
    case 'childGrade':
      return row.childGrade ? (GRADE_SORT_KEY[row.childGrade as Grade] ?? 999) : 999
    case 'status':
      // By the label the admin reads, not the enum code.
      return statusSortValue(row.status)
  }
}

function statusSortValue(status: string): string {
  return INQUIRY_STATUS_LABELS[status] ?? status
}

export const WAITLIST_SORT_KEYS = ['position', 'waitlistedAt', 'child', 'parent', 'status', 'groups'] as const
export type WaitlistSortKey = (typeof WAITLIST_SORT_KEYS)[number]

type WaitlistSortFields = {
  parentName: string
  childFirstName: string | null
  childLastName: string | null
  status: string
  waitlistedAt: Date | null
  waitlist?: { position: number | null; hasFreeSpot: boolean }
}

export function waitlistSortValue(key: WaitlistSortKey, row: WaitlistSortFields): SortValue {
  switch (key) {
    case 'position':
      return row.waitlist?.position ?? 9999
    case 'waitlistedAt':
      return row.waitlistedAt?.getTime() ?? 0
    case 'child':
      return formatChildName(row, '')
    case 'parent':
      return row.parentName
    case 'status':
      // By the label the admin reads, not the enum code.
      return statusSortValue(row.status)
    case 'groups':
      // Rows with a free acceptable group first — that is what the admin scans for.
      return row.waitlist?.hasFreeSpot ? 0 : 1
  }
}
