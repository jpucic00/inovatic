'use client'

import Link from 'next/link'
import type { StudentRow } from '@/actions/admin/student'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'

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
    key: 'username',
    header: 'Korisničko ime',
    sortable: true,
    sortValue: (row) => row.username ?? '',
    cell: (row) => (
      <span className="font-mono text-sm text-gray-600">
        {row.username ?? '—'}
      </span>
    ),
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
    key: 'createdAt',
    header: 'Datum',
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
