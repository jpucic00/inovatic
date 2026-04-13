'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Wrench, Copy, Check, Trash2, Users, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { deleteCourse } from '@/actions/admin/course'
import Link from 'next/link'

type Course = {
  id: string
  slug: string
  title: string
  level: string | null
  isCustom: boolean
  ageMin: number
  ageMax: number
  equipment: string | null
  price: number | null
  _count: { scheduledGroups: number }
}

interface CourseTableProps {
  data: Course[]
}

const PAGE_SIZE = 5

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
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Kopirano' : 'Kopiraj URL'}
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
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
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

function CourseCard({ course }: Readonly<{ course: Course }>) {
  const groupCount = course._count.scheduledGroups

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="w-5 h-5 text-orange-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{course.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{course.ageMin}–{course.ageMax} god.</span>
              {course.price != null && (
                <>
                  <span className="text-xs text-gray-300">|</span>
                  <span className="text-xs text-gray-400">{course.price} EUR</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyUrlButton slug={course.slug} />
          {groupCount > 0 && (
            <Link
              href="/admin/grupe?tab=__radionice__"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-md hover:bg-cyan-100 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              {groupCount} {groupCount >= 2 && groupCount <= 4 ? 'grupe' : 'grupa'}
            </Link>
          )}
          <DeleteCourseButton course={course} />
        </div>
      </div>
    </div>
  )
}

export function CourseTable({ data }: Readonly<CourseTableProps>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((c) => c.title.toLowerCase().includes(q))
  }, [data, search])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(1, pageCount))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Pretraži radionice..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      {paginated.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-4">
          {search ? 'Nema rezultata.' : 'Nema radionica.'}
        </p>
      ) : (
        paginated.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-gray-500">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} od {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed"
              aria-label="Prethodna stranica"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={[
                  'min-w-[2rem] text-center px-2 py-1.5 text-sm rounded-md border transition-colors',
                  p === currentPage
                    ? 'bg-cyan-600 text-white border-cyan-600 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400',
                ].join(' ')}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed"
              aria-label="Sljedeća stranica"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
