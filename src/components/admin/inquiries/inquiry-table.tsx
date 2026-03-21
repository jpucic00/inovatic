'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { COURSE_LEVEL_LABELS } from '@/lib/inquiry-status'
import { formatChildName } from '@/lib/format'

// Minimal type matching what we pass from the server
type InquiryRow = {
  id: string
  parentName: string
  parentEmail: string
  childName: string | null
  childFirstName: string | null
  childLastName: string | null
  childAge: number | null
  childDateOfBirth: string | null
  courseLevelPref: string | null
  locationPref: string | null
  status: string
  createdAt: Date
}

const columns: ColumnDef<InquiryRow>[] = [
  {
    key: 'createdAt',
    header: 'Datum',
    sortable: true,
    sortValue: (row) => row.createdAt,
    cell: (row) => (
      <span className="text-sm text-gray-600 whitespace-nowrap">
        {row.createdAt.toLocaleDateString('hr-HR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
  {
    key: 'parentName',
    header: 'Roditelj',
    sortable: true,
    sortValue: (row) => row.parentName,
    cell: (row) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{row.parentName}</p>
        <p className="text-xs text-gray-500">{row.parentEmail}</p>
      </div>
    ),
  },
  {
    key: 'childName',
    header: 'Dijete',
    sortable: true,
    sortValue: (row) => formatChildName(row, ''),
    cell: (row) => {
      const name = formatChildName(row)
      let age: string | null = null
      if (row.childDateOfBirth) {
        age = `r. ${row.childDateOfBirth}`
      } else if (row.childAge != null) {
        age = `${row.childAge} god.`
      }
      return (
        <div>
          <p className="text-sm text-gray-900">{name}</p>
          {age && <p className="text-xs text-gray-500">{age}</p>}
        </div>
      )
    },
  },
  {
    key: 'courseLevelPref',
    header: 'Tečaj',
    cell: (row) => {
      const levelLabel = row.courseLevelPref
        ? (COURSE_LEVEL_LABELS[row.courseLevelPref] ?? row.courseLevelPref)
        : null
      return (
        <span className="text-sm text-gray-600">
          {levelLabel ?? <span className="text-gray-400 italic">—</span>}
        </span>
      )
    },
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (row) => row.status,
    cell: (row) => <InquiryStatusBadge status={row.status} />,
  },
  {
    key: 'actions',
    header: '',
    cell: (row) => (
      <Link
        href={`/admin/upiti/${row.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        Detalji
      </Link>
    ),
  },
]

interface InquiryTableProps {
  data: InquiryRow[]
}

export function InquiryTable({ data }: Readonly<InquiryTableProps>) {
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      emptyMessage="Nema upita koji odgovaraju filteru."
    />
  )
}
