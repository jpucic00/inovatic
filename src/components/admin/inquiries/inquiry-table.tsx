'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { InquiryTypeBadge } from './inquiry-type-badge'
import { ReturningInquiryBadge } from './returning-inquiry-badge'
import { formatChildName } from '@/lib/format'
import { GRADE_LABELS, GRADE_SORT_KEY, type Grade } from '@/lib/inquiry-status'

// Minimal type matching what we pass from the server
type InquiryRow = {
  id: string
  type: string
  parentName: string
  parentEmail: string
  childFirstName: string | null
  childLastName: string | null
  childDateOfBirth: string | null
  childGrade: string | null
  status: string
  isReturning?: boolean
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
        {(() => {
          const d = new Date(row.createdAt)
          const dd = String(d.getDate()).padStart(2, '0')
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const yyyy = d.getFullYear()
          return `${dd}.${mm}.${yyyy}.`
        })()}
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
    sortValue: (row) => (row.type === 'PARTY' ? 'zzz' : formatChildName(row, '')),
    cell: (row) => {
      if (row.type === 'PARTY') {
        return <span className="text-sm italic text-fuchsia-700">Proslava rođendana</span>
      }
      const name = formatChildName(row)
      const age = row.childDateOfBirth ? `r. ${row.childDateOfBirth}` : null
      return (
        <div>
          <p className="text-sm text-gray-900">{name}</p>
          {age && <p className="text-xs text-gray-500">{age}</p>}
        </div>
      )
    },
  },
  {
    key: 'childGrade',
    header: 'Razred',
    sortable: true,
    sortValue: (row) =>
      row.childGrade ? (GRADE_SORT_KEY[row.childGrade as Grade] ?? 999) : 999,
    cell: (row) => (
      <span className="text-sm text-gray-700 whitespace-nowrap">
        {row.childGrade
          ? (GRADE_LABELS[row.childGrade as Grade] ?? row.childGrade)
          : '–'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (row) => row.status,
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <InquiryStatusBadge status={row.status} />
        <InquiryTypeBadge type={row.type} />
        {row.isReturning && <ReturningInquiryBadge />}
      </div>
    ),
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
