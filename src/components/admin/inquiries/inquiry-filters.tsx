'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRADE_VALUES, GRADE_LABELS } from '@/lib/inquiry-status'

const STATUSES = [
  { value: 'ALL', label: 'Sve' },
  { value: 'NEW', label: 'Nove' },
  { value: 'ACCOUNT_CREATED', label: 'Račun stvoren' },
  { value: 'DECLINED', label: 'Odbijene' },
]

interface InquiryFiltersProps {
  currentStatus: string
  currentSearch: string
  currentCourse: string
  currentGrade: string
  currentType: string
  courses: { id: string; title: string }[]
}

export function InquiryFilters({ currentStatus, currentSearch, currentCourse, currentGrade, currentType, courses }: Readonly<InquiryFiltersProps>) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)

  const pushUrl = (params: { status?: string; search?: string; course?: string; grade?: string; type?: string }) => {
    const sp = new URLSearchParams()
    const s = params.status ?? currentStatus
    const q = params.search ?? currentSearch
    const c = params.course ?? currentCourse
    const g = params.grade ?? currentGrade
    const t = params.type ?? currentType
    if (s && s !== 'ALL') sp.set('status', s)
    if (q) sp.set('search', q)
    if (c) sp.set('course', c)
    if (g) sp.set('grade', g)
    if (t && t !== 'ALL') sp.set('type', t)
    // Always reset to page 1 when filters change
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`)
    })
  }

  const handleSearchSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    pushUrl({ search: searchRef.current?.value ?? '' })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <select
        value={currentType || 'ALL'}
        onChange={(e) => pushUrl({ type: e.target.value })}
        className="px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      >
        <option value="ALL">Sve vrste</option>
        <option value="COURSE">Upisi</option>
        <option value="PARTY">Proslave</option>
      </select>

      <select
        value={currentCourse}
        onChange={(e) => pushUrl({ course: e.target.value })}
        className="px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      >
        <option value="">Svi upiti</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
        <option value="NONE">Upiti bez preference programa</option>
      </select>

      <select
        value={currentGrade}
        onChange={(e) => pushUrl({ grade: e.target.value })}
        className="px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      >
        <option value="">Svi razredi</option>
        {GRADE_VALUES.map((v) => (
          <option key={v} value={v}>{GRADE_LABELS[v]}</option>
        ))}
      </select>

      <form onSubmit={handleSearchSubmit} className="relative flex-1 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Pretraži po imenu roditelja ili djeteta..."
            className="pl-9"
            defaultValue={currentSearch}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Traži
        </button>
      </form>

      <div className="flex gap-1 flex-wrap">
        {STATUSES.map((s) => {
          const isActive =
            s.value === 'ALL'
              ? !currentStatus || currentStatus === 'ALL'
              : currentStatus === s.value
          return (
            <button
              key={s.value}
              onClick={() => pushUrl({ status: s.value })}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
