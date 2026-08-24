'use client'

import Link from 'next/link'
import type { StudentRow } from '@/actions/admin/student'
import { formatDate } from '@/lib/format'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { PaymentStatusBadge } from '@/components/admin/students/payment-status-badge'
import { ReturningBadge } from '@/components/admin/returning-badge'
import { PAYMENT_STATUS_SORT_KEY } from '@/lib/payment-status'

/**
 * Every column that can differ by school year is resolved against the one the
 * list is scoped to. "Ponovni upis" names it in its header — the admin cannot
 * tell "returned this year" from "returned at some point" by looking — and the
 * Grupe cell shows only that year's groups, so a child's list of chips answers
 * "where is this kid now" rather than replaying their whole history.
 */
const buildColumns = (schoolYear: string): ColumnDef<StudentRow>[] => [
  {
    key: 'name',
    header: 'Ime i prezime',
    sortable: true,
    sortValue: (row) => `${row.firstName} ${row.lastName}`,
    cell: (row) => (
      <Link
        href={`/admin/ucenici/${row.id}`}
        className="font-medium text-gray-900 hover:text-cyan-700 transition-colors"
      >
        {row.firstName} {row.lastName}
      </Link>
    ),
  },
  {
    key: 'dateOfBirth',
    header: 'Datum rođenja',
    sortable: true,
    sortValue: (row) => row.dateOfBirth ?? '',
    cell: (row) => {
      const iso = row.dateOfBirth
      if (!iso) return <span className="text-gray-400">—</span>
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
      if (!m) return iso
      return `${m[3]}.${m[2]}.${m[1]}.`
    },
  },
  {
    key: 'groups',
    header: 'Grupe',
    cell: (row) => {
      // `enrollments` deliberately carries every year — the payment status reads
      // debts across all of them — so the year filter belongs here, at the point
      // where the chips are drawn.
      const inYear = row.enrollments.filter((e) => e.schoolYear === schoolYear)
      if (inYear.length === 0) {
        return <span className="text-gray-400 italic">Nema upisa</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {inYear.map((e) => (
            <span
              key={e.id}
              className="inline-block px-2 py-0.5 text-xs bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-md"
            >
              {e.scheduledGroup.name ?? e.scheduledGroup.course.title}
            </span>
          ))}
        </div>
      )
    },
  },
  {
    key: 'returning',
    header: `Ponovni upis (${schoolYear})`,
    sortable: true,
    // Descending puts the returning kids on top, which is the way this column
    // gets read — the filter is for extracting them, the sort for spotting them.
    sortValue: (row) => (row.isReturning ? 1 : 0),
    cell: (row) =>
      row.isReturning ? <ReturningBadge /> : <span className="text-gray-400">—</span>,
  },
  {
    key: 'payment',
    header: 'Plaćanje',
    sortable: true,
    sortValue: (row) => PAYMENT_STATUS_SORT_KEY[row.paymentStatus],
    cell: (row) => <PaymentStatusBadge status={row.paymentStatus} />,
  },
  {
    key: 'createdAt',
    header: 'Datum kreiranja',
    sortable: true,
    sortValue: (row) => row.createdAt.getTime(),
    cell: (row) => formatDate(new Date(row.createdAt)),
  },
  {
    key: 'actions',
    header: '',
    cell: (row) => (
      <Link
        href={`/admin/ucenici/${row.id}`}
        className="text-sm text-cyan-600 hover:text-cyan-800 transition-colors"
      >
        Detalji
      </Link>
    ),
  },
]

interface StudentTableProps {
  data: StudentRow[]
  /**
   * The school year the list is scoped to — the same one every row's
   * `isReturning` and `paymentStatus` were resolved against.
   */
  schoolYear: string
}

export function StudentTable({ data, schoolYear }: Readonly<StudentTableProps>) {
  return (
    <DataTable
      data={data}
      columns={buildColumns(schoolYear)}
      getRowKey={(row) => row.id}
      // Names the year: an empty list here means "nobody is enrolled in this
      // year", which is an ordinary state for a year not yet filled in — and
      // reads as missing data unless it says which year it is talking about.
      emptyMessage={`Nema učenika upisanih u ${schoolYear}.`}
    />
  )
}
