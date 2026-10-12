'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import {
  compareSortValues,
  nextListSort,
  sortQueryFor,
  type ListSort,
  type SortDir,
} from '@/lib/list-sort'
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
  /**
   * For a paginated list: the sort lives in the URL (`?sort=&dir=`) and the
   * server has already applied it across every page, so the headers become
   * links and `data` is rendered in the order it arrives. Without it the table
   * sorts `data` in place — correct only when `data` is the whole list.
   */
  urlSort?: { current: ListSort | undefined }
}

function normalizeValue(val: unknown): string | number {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val
  if (val instanceof Date) return val.getTime()
  return ''
}

function SortIcon({ dir }: Readonly<{ dir: SortDir | undefined }>) {
  if (dir === 'asc') return <ChevronUp className="w-3 h-3" />
  if (dir === 'desc') return <ChevronDown className="w-3 h-3" />
  return <ChevronsUpDown className="w-3 h-3 opacity-40" />
}

function UrlSortLink({
  columnKey,
  current,
  children,
}: Readonly<{ columnKey: string; current: ListSort | undefined; children: React.ReactNode }>) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const qs = sortQueryFor(new URLSearchParams(searchParams.toString()), current, columnKey)
  return (
    <Link
      href={qs ? `${pathname}?${qs}` : pathname}
      scroll={false}
      className="flex items-center gap-1 hover:text-gray-900 transition-colors"
    >
      {children}
    </Link>
  )
}

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = 'Nema podataka.',
  getRowKey,
  urlSort,
}: Readonly<DataTableProps<TData>>) {
  const [localSort, setLocalSort] = useState<ListSort | undefined>(undefined)
  const activeSort = urlSort ? urlSort.current : localSort

  const sortValueOf = (col: ColumnDef<TData> | undefined, key: string, row: TData) =>
    normalizeValue(col?.sortValue ? col.sortValue(row) : (row as Record<string, unknown>)[key])

  const sorted =
    !urlSort && localSort
      ? [...data].sort((a, b) => {
          const col = columns.find((c) => c.key === localSort.key)
          const cmp = compareSortValues(
            sortValueOf(col, localSort.key, a),
            sortValueOf(col, localSort.key, b),
          )
          return localSort.dir === 'asc' ? cmp : -cmp
        })
      : data

  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            {columns.map((col) => {
              const dir = activeSort?.key === col.key ? activeSort.dir : undefined
              let header: React.ReactNode = col.header
              if (col.sortable && urlSort) {
                header = (
                  <UrlSortLink columnKey={col.key} current={urlSort.current}>
                    {col.header}
                    <SortIcon dir={dir} />
                  </UrlSortLink>
                )
              } else if (col.sortable) {
                header = (
                  <button
                    onClick={() => setLocalSort(nextListSort(localSort, col.key))}
                    className="flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    {col.header}
                    <SortIcon dir={dir} />
                  </button>
                )
              }
              let ariaSort: 'ascending' | 'descending' | undefined
              if (dir === 'asc') ariaSort = 'ascending'
              else if (dir === 'desc') ariaSort = 'descending'
              return (
                <TableHead
                  key={col.key}
                  aria-sort={ariaSort}
                  className="text-xs font-semibold text-gray-500"
                >
                  {header}
                </TableHead>
              )
            })}
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
