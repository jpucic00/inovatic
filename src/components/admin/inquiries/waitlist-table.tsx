'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { ReturningBadge } from '@/components/admin/returning-badge'
import { formatChildName, formatDate } from '@/lib/format'
import { GRADE_LABELS, type Grade } from '@/lib/inquiry-status'
import type { WaitlistGroupView } from '@/lib/waitlist'

type WaitlistRow = {
  id: string
  parentName: string
  parentPhone: string
  childFirstName: string | null
  childLastName: string | null
  childGrade: string | null
  status: string
  isReturning?: boolean
  waitlistedAt: Date | null
  waitlistNote: string | null
  waitlist?: {
    position: number | null
    groups: WaitlistGroupView[]
    hasFreeSpot: boolean
  }
}

const columns: ColumnDef<WaitlistRow>[] = [
  {
    key: 'position',
    header: '#',
    sortable: true,
    sortValue: (row) => row.waitlist?.position ?? 9999,
    cell: (row) => (
      <span className="text-sm font-semibold text-gray-900 tabular-nums">
        {row.waitlist?.position ?? '–'}
      </span>
    ),
  },
  {
    key: 'waitlistedAt',
    header: 'Na listi od',
    sortable: true,
    sortValue: (row) => row.waitlistedAt ?? 0,
    cell: (row) => (
      <span className="text-sm text-gray-600 whitespace-nowrap">
        {row.waitlistedAt ? formatDate(new Date(row.waitlistedAt)) : '–'}
      </span>
    ),
  },
  {
    key: 'child',
    header: 'Dijete',
    sortable: true,
    sortValue: (row) => formatChildName(row, ''),
    cell: (row) => (
      <div>
        <p className="text-sm text-gray-900">{formatChildName(row)}</p>
        {row.childGrade && (
          <p className="text-xs text-gray-500">
            {GRADE_LABELS[row.childGrade as Grade] ?? row.childGrade}
          </p>
        )}
      </div>
    ),
  },
  {
    key: 'parent',
    header: 'Roditelj',
    sortable: true,
    sortValue: (row) => row.parentName,
    cell: (row) => (
      <div>
        <p className="text-sm text-gray-900">{row.parentName}</p>
        <a href={`tel:${row.parentPhone}`} className="text-xs text-cyan-700 hover:underline">
          {row.parentPhone}
        </a>
      </div>
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
        {row.isReturning && <ReturningBadge />}
      </div>
    ),
  },
  {
    key: 'groups',
    header: 'Prihvatljivi termini',
    sortable: true,
    // Rows with a free acceptable group first — that is what the admin scans for.
    sortValue: (row) => (row.waitlist?.hasFreeSpot ? 0 : 1),
    cell: (row) => {
      const groups = row.waitlist?.groups ?? []
      return (
        <div className="space-y-1">
          {row.waitlist?.hasFreeSpot && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-800 border-emerald-200">
              Slobodno mjesto
            </span>
          )}
          {groups.length === 0 ? (
            <p className="text-sm italic text-gray-400">Nije odabrana grupa</p>
          ) : (
            <ul className="space-y-1">
              {groups.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-1.5 text-xs text-gray-700">
                  <span>{[g.name, g.schedule].filter(Boolean).join(' · ')}</span>
                  <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    },
  },
  {
    key: 'note',
    header: 'Napomena',
    cell: (row) =>
      row.waitlistNote ? (
        <p className="text-sm text-gray-700 max-w-xs line-clamp-3 whitespace-pre-wrap">
          {row.waitlistNote}
        </p>
      ) : (
        <span className="text-sm text-gray-400">–</span>
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

interface WaitlistTableProps {
  data: WaitlistRow[]
}

export function WaitlistTable({ data }: Readonly<WaitlistTableProps>) {
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      emptyMessage="Lista čekanja je prazna."
    />
  )
}
