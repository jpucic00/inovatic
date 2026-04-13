'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { formatChildName } from '@/lib/format'

// Minimal type matching what we pass from the server
type InquiryRow = {
  id: string
  parentName: string
  parentEmail: string
  childFirstName: string
  childLastName: string
  childDateOfBirth: string | null
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
    sortValue: (row) => formatChildName(row, ''),
    cell: (row) => {
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
