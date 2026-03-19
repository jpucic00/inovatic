'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface ColumnDef<TData> {
  key: string
  header: string
  sortable?: boolean
  sortValue?: (row: TData) => string | number | Date
  cell: (row: TData) => React.ReactNode
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  emptyMessage?: string
  getRowKey: (row: TData) => string
}

type SortDir = 'asc' | 'desc' | null

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = 'Nema podataka.',
  getRowKey,
}: DataTableProps<TData>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
      setSortDir(null)
    }
  }

  const sorted =
    sortKey && sortDir
      ? [...data].sort((a, b) => {
          const col = columns.find((c) => c.key === sortKey)
          const av = col?.sortValue ? col.sortValue(a) : String((a as Record<string, unknown>)[sortKey] ?? '')
          const bv = col?.sortValue ? col.sortValue(b) : String((b as Record<string, unknown>)[sortKey] ?? '')

          let cmp: number
          if (av instanceof Date && bv instanceof Date) {
            cmp = av.getTime() - bv.getTime()
          } else if (typeof av === 'number' && typeof bv === 'number') {
            cmp = av - bv
          } else {
            cmp = String(av).localeCompare(String(bv), 'hr')
          }
          return sortDir === 'asc' ? cmp : -cmp
        })
      : data

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                {col.sortable ? (
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    {col.header}
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center py-10 text-gray-400 italic"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow
                key={getRowKey(row)}
                className="hover:bg-gray-50 transition-colors"
              >
                {columns.map((col) => (
                  <TableCell key={col.key}>{col.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
