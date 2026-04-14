'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createNewSchoolYear } from '@/actions/admin/school-year'
import { getNextSchoolYear } from '@/lib/school-year'

interface SchoolYearSelectorProps {
  years: string[]
  currentYear: string
  selectedYear: string
  basePath?: string
  showCreateButton?: boolean
}

export function SchoolYearSelector({
  years,
  currentYear,
  selectedYear,
  basePath = '/admin/programi',
  showCreateButton = true,
}: Readonly<SchoolYearSelectorProps>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const nextYear = getNextSchoolYear(years[0] ?? currentYear)

  const handleYearClick = (year: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (year === currentYear) {
      params.delete('schoolYear')
    } else {
      params.set('schoolYear', year)
    }
    router.push(`${basePath}?${params.toString()}`)
  }

  const handleCreateYear = () => {
    startTransition(async () => {
      const res = await createNewSchoolYear(nextYear)
      if (res.success) {
        toast.success(`Školska godina ${nextYear} kreirana.`)
        setShowConfirm(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => handleYearClick(year)}
          className={[
            'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
            selectedYear === year
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          ].join(' ')}
        >
          {year}
          {year === currentYear && (
            <span className="ml-1 w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
          )}
        </button>
      ))}

      {showCreateButton && (
        showConfirm ? (
          <div className="inline-flex items-center gap-2 ml-2">
            <span className="text-xs text-gray-500">Kreirati {nextYear}?</span>
            <button
              onClick={handleCreateYear}
              disabled={isPending}
              className="px-2.5 py-1 text-xs font-medium text-white bg-cyan-600 rounded-full hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Kreiram...' : 'Da'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
              Ne
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-full hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Nova školska godina"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova godina
          </button>
        )
      )}
    </div>
  )
}
