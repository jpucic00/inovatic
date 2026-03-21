'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, Copy, Check, Link2, Trash2 } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toggleCourseActive, deleteCourse } from '@/actions/admin/course'

type Course = {
  id: string
  slug: string
  title: string
  level: string | null
  isCustom: boolean
  isActive: boolean
  ageMin: number
  ageMax: number
  equipment: string | null
  price: number | null
  _count: { scheduledGroups: number }
}

interface CourseTableProps {
  data: Course[]
}

function CopyUrlButton({ slug }: Readonly<{ slug: string }>) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const url = `${globalThis.location.origin}/radionice/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Kopiraj URL prijave"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Kopirano' : 'Kopiraj URL'}
    </button>
  )
}

function ToggleActiveButton({ course }: Readonly<{ course: Course }>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleCourseActive(course.id)
      if (result.success) {
        toast.success(course.isActive ? 'Program deaktiviran.' : 'Program aktiviran.')
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
      className={[
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border transition-colors disabled:opacity-50',
        course.isActive
          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
      ].join(' ')}
    >
      {course.isActive ? 'Aktivan' : 'Neaktivan'}
    </button>
  )
}

function DeleteCourseButton({ course }: Readonly<{ course: Course }>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCourse(course.id)
      if (result.success) {
        toast.success('Radionica obrisana.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
        title="Obriši radionicu"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Obriši
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Obriši radionicu</DialogTitle>
            <DialogDescription>
              Jeste li sigurni da želite obrisati radionicu{' '}
              <span className="font-medium text-gray-900">{course.title}</span>?
              Bit će obrisane i sve pridružene grupe. Ova radnja se ne može poništiti.
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

const columns: ColumnDef<Course>[] = [
  {
    key: 'title',
    header: 'Naziv',
    sortable: true,
    cell: (row) => (
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />
        <div>
          <p className="font-medium text-gray-900 text-sm">{row.title}</p>
          {row.isCustom && (
            <span className="text-xs text-orange-600 font-medium">Radionica</span>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'level',
    header: 'Razina',
    cell: (row) => (
      <span className="text-sm text-gray-600">{row.level ?? '–'}</span>
    ),
  },
  {
    key: 'ageRange',
    header: 'Dob',
    cell: (row) => (
      <span className="text-sm text-gray-600">{row.ageMin}–{row.ageMax} god.</span>
    ),
  },
  {
    key: 'price',
    header: 'Cijena',
    cell: (row) =>
      row.isCustom ? (
        <span className="text-sm text-gray-600">{row.price == null ? '–' : `${row.price} €`}</span>
      ) : (
        <span className="text-sm text-gray-400 italic">SLR tečaj</span>
      ),
  },
  {
    key: 'groups',
    header: 'Grupe',
    cell: (row) => (
      <span className="text-sm text-gray-600">{row._count.scheduledGroups}</span>
    ),
  },
  {
    key: 'url',
    header: 'URL prijave',
    cell: (row) =>
      row.isCustom ? (
        <CopyUrlButton slug={row.slug} />
      ) : (
        <Link2 className="w-4 h-4 text-gray-300" />
      ),
  },
  {
    key: 'isActive',
    header: 'Status',
    cell: (row) => <ToggleActiveButton course={row} />,
  },
  {
    key: 'actions',
    header: '',
    cell: (row) =>
      row.isCustom ? <DeleteCourseButton course={row} /> : null,
  },
]

export function CourseTable({ data }: Readonly<CourseTableProps>) {
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      emptyMessage="Nema programa."
    />
  )
}
