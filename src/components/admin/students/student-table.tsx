'use client'

import Link from 'next/link'
import type { StudentRow } from '@/actions/admin/student'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { PaymentStatusBadge } from '@/components/admin/students/payment-status-badge'
import { PAYMENT_STATUS_SORT_KEY } from '@/lib/payment-status'

const columns: ColumnDef<StudentRow>[] = [
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
      if (row.enrollments.length === 0) {
        return <span className="text-gray-400 italic">Nema upisa</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {row.enrollments.map((e) => (
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
    cell: (row) => {
      const d = new Date(row.createdAt)
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}.${mm}.${yyyy}.`
    },
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
}

export function StudentTable({ data }: Readonly<StudentTableProps>) {
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyMessage="Nema učenika za prikaz."
    />
  )
}
