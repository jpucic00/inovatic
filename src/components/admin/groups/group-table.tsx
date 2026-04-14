'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { deleteGroup } from '@/actions/admin/group'
import { EditGroupDialog, type GroupForEdit } from './edit-group-dialog'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

type Group = GroupForEdit & {
  course: { id: string; title: string; level: string | null; isCustom: boolean }
  location: { id: string; name: string }
  _count: {
    enrollments: number
    preferredInquiries: number
    assignedInquiries: number
    materials: number
    studentComments: number
  }
}

function isGroupDeletable(group: Group): boolean {
  return (
    group._count.enrollments === 0 &&
    group._count.preferredInquiries === 0 &&
    group._count.assignedInquiries === 0 &&
    group._count.materials === 0 &&
    group._count.studentComments === 0
  )
}

function DeleteGroupButton({ group }: Readonly<{ group: Group }>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteGroup(group.id)
      if (result.success) {
        toast.success('Grupa obrisana.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const label = group.name ?? group.course.title

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
        title="Obriši grupu"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Obriši
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Obriši grupu</DialogTitle>
            <DialogDescription>
              Jeste li sigurni da želite obrisati grupu{' '}
              <span className="font-medium text-gray-900">{label}</span>?
              Ova radnja se ne može poništiti.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Brišem...' : 'Obriši'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
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
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <EditGroupDialog group={row} courses={courses} locations={locations} />
          {isGroupDeletable(row) && <DeleteGroupButton group={row} />}
        </div>
      ),
    },
  )

  return cols
}

export function GroupTable({ data, courses, locations, hideProgram = false }: Readonly<GroupTableProps>) {
  const columns = buildColumns(courses, locations, hideProgram)

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      emptyMessage="Nema grupa."
    />
  )
}
