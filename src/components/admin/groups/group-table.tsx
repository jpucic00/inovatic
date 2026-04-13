'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { toggleGroupActive } from '@/actions/admin/group'
import { EditGroupDialog, type GroupForEdit } from './edit-group-dialog'
import { cn } from '@/lib/utils'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

type Group = GroupForEdit & {
  isActive: boolean
  course: { id: string; title: string; level: string | null; isCustom: boolean }
  location: { id: string; name: string }
  _count: { enrollments: number; preferredInquiries: number }
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}.`
}

interface GroupTableProps {
  data: Group[]
  courses: CourseOption[]
  locations: LocationOption[]
  hideProgram?: boolean
}

function getCapacityColor(pct: number): string {
  if (pct >= 1) return 'text-red-600'
  if (pct >= 0.75) return 'text-amber-600'
  return 'text-green-600'
}

function EnrollmentBadge({ group }: Readonly<{ group: Group }>) {
  const count = group._count.enrollments
  const max = group.maxStudents
  const pct = max > 0 ? count / max : 0
  const color = getCapacityColor(pct)

  return (
    <span className={`text-sm font-medium tabular-nums ${color}`}>
      {count}/{max}
    </span>
  )
}

function EnrollmentWindowBadge({ group }: Readonly<{ group: Group }>) {
  if (!group.enrollmentStart && !group.enrollmentEnd) {
    return <span className="text-xs text-gray-400">Uvijek</span>
  }
  const now = new Date()
  const started = !group.enrollmentStart || group.enrollmentStart <= now
  const ended = group.enrollmentEnd && group.enrollmentEnd < now
  if (ended) return <span className="text-xs text-gray-400">Zatvoreno</span>
  if (started) return <span className="text-xs text-green-600 font-medium">Otvoreno</span>
  return <span className="text-xs text-amber-600">Uskoro</span>
}

function DeactivateButton({ group }: Readonly<{ group: Group }>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleGroupActive(group.id)
      if (result.success) {
        toast.success(group.isActive ? 'Grupa deaktivirana.' : 'Grupa aktivirana.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50',
        group.isActive
          ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
          : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100',
      )}
    >
      {isPending ? '...' : group.isActive ? 'Deaktiviraj' : 'Aktiviraj'}
    </button>
  )
}

type ActiveFilter = 'active' | 'inactive'

function buildColumns(
  courses: CourseOption[],
  locations: LocationOption[],
  hideProgram: boolean,
): ColumnDef<Group>[] {
  const cols: ColumnDef<Group>[] = []

  cols.push({
    key: 'name',
    header: 'Naziv grupe',
    sortable: true,
    sortValue: (row) => row.name ?? row.course.title,
    cell: (row) => (
      <Link
        href={`/admin/grupe/${row.id}`}
        className="font-medium text-sm text-cyan-700 hover:text-cyan-900 hover:underline"
      >
        {row.name ?? '–'}
      </Link>
    ),
  })

  if (!hideProgram) {
    cols.push({
      key: 'course',
      header: 'Program',
      sortable: true,
      sortValue: (row) => row.course.title,
      cell: (row) => (
        <span className="text-sm text-gray-600">{row.course.title}</span>
      ),
    })
  }

  cols.push(
    {
      key: 'location',
      header: 'Lokacija',
      cell: (row) => <span className="text-sm text-gray-600">{row.location.name}</span>,
    },
    {
      key: 'schedule',
      header: 'Termin',
      cell: (row) => {
        if (row.course.isCustom && row.date) {
          return (
            <span className="text-sm text-gray-600">
              {formatDate(row.date)}{row.startTime ? ` ${row.startTime}` : ''}
            </span>
          )
        }
        const startTimeSuffix = row.startTime ? `, ${row.startTime}` : ''
        const scheduleText = row.dayOfWeek ? `${row.dayOfWeek}${startTimeSuffix}` : '–'
        return (
          <span className="text-sm text-gray-600">
            {scheduleText}
          </span>
        )
      },
    },
    {
      key: 'inquiries',
      header: 'Upiti',
      cell: (row) => (
        <span className="text-sm tabular-nums text-gray-700">
          {row._count.preferredInquiries}
        </span>
      ),
    },
    {
      key: 'enrollments',
      header: 'Polaznici',
      cell: (row) => <EnrollmentBadge group={row} />,
    },
    {
      key: 'window',
      header: 'Upisi',
      cell: (row) => <EnrollmentWindowBadge group={row} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border',
            row.isActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200',
          )}
        >
          {row.isActive ? 'Aktivna' : 'Neaktivna'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <EditGroupDialog group={row} courses={courses} locations={locations} />
          <DeactivateButton group={row} />
        </div>
      ),
    },
  )

  return cols
}

export function GroupTable({ data, courses, locations, hideProgram = false }: Readonly<GroupTableProps>) {
  const [filter, setFilter] = useState<ActiveFilter>('active')
  const columns = buildColumns(courses, locations, hideProgram)

  const filteredData = filter === 'active'
    ? data.filter((g) => g.isActive)
    : data.filter((g) => !g.isActive)
  const activeCount = data.filter((g) => g.isActive).length
  const inactiveCount = data.length - activeCount
  const hasInactive = inactiveCount > 0

  return (
    <div>
      {hasInactive && (
        <div className="flex gap-1 mb-4">
          {([
            { value: 'active' as const, label: `Aktivne (${activeCount})` },
            { value: 'inactive' as const, label: `Neaktivne (${inactiveCount})` },
          ]).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md border transition-colors',
                filter === f.value
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      <DataTable
        columns={columns}
        data={filteredData}
        getRowKey={(row) => row.id}
        emptyMessage="Nema grupa."
      />
    </div>
  )
}
