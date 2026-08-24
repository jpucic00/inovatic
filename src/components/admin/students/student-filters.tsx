'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { RETURNING_FILTER_LABELS } from '@/lib/returning-filter'
import { PAYMENT_FILTER_VALUES, PAYMENT_STATUS_LABELS } from '@/lib/payment-status'

type CourseOption = { id: string; title: string }
type GroupOption = { id: string; name: string | null; course: { title: string } }

interface StudentFiltersProps {
  currentSearch: string
  currentCourseId?: string
  currentGroupId?: string
  currentPayment?: string
  currentReturning?: string
  /**
   * The school year the whole list is scoped to (the sidebar selection), named
   * in the ponovni-upis options. There is deliberately no Godina control here —
   * the year is not this page's to change.
   */
  returningYear?: string
  courses?: CourseOption[]
  groups?: GroupOption[]
}

export function StudentFilters({
  currentSearch,
  currentCourseId,
  currentGroupId,
  currentPayment,
  currentReturning,
  returningYear,
  courses,
  groups,
}: Readonly<StudentFiltersProps>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)

  const showFilters = courses && groups

  const buildParams = (overrides: Record<string, string>) => {
    const sp = new URLSearchParams()
    // Preserve scheduleId if present (coming from module link)
    const scheduleId = searchParams.get('scheduleId')
    if (scheduleId) sp.set('scheduleId', scheduleId)

    const search = overrides.search ?? searchRef.current?.value ?? ''
    if (search) sp.set('search', search)

    if (showFilters) {
      const courseId = overrides.courseId ?? currentCourseId ?? ''
      const groupId = overrides.groupId ?? currentGroupId ?? ''
      const payment = overrides.payment ?? currentPayment ?? ''
      const returning = overrides.returning ?? currentReturning ?? ''
      if (courseId) sp.set('courseId', courseId)
      if (groupId) sp.set('groupId', groupId)
      if (payment) sp.set('payment', payment)
      if (returning) sp.set('returning', returning)
    }

    return sp.toString()
  }

  const handleSearchSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(() => {
      router.push(`${pathname}?${buildParams({ search: searchRef.current?.value ?? '' })}`)
    })
  }

  const handleCourseChange = (courseId: string) => {
    startTransition(() => {
      router.push(`${pathname}?${buildParams({ courseId, groupId: '' })}`)
    })
  }

  const handleGroupChange = (groupId: string) => {
    startTransition(() => {
      router.push(`${pathname}?${buildParams({ groupId })}`)
    })
  }

  const handlePaymentChange = (payment: string) => {
    startTransition(() => {
      router.push(`${pathname}?${buildParams({ payment })}`)
    })
  }

  const handleReturningChange = (returning: string) => {
    startTransition(() => {
      router.push(`${pathname}?${buildParams({ returning })}`)
    })
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      <form onSubmit={handleSearchSubmit} className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Pretraži po imenu ili korisničkom imenu..."
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

      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <select
            value={currentCourseId ?? ''}
            onChange={(e) => handleCourseChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Svi programi</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <select
            value={currentGroupId ?? ''}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sve grupe</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name ?? g.course.title}
              </option>
            ))}
          </select>

          {/* Options come from the badge's own label map: the dropdown and the
              table cell must call each state by the same name, or "Nije
              dospjelo" in one place and something else in the other reads as
              two different things. */}
          <select
            value={currentPayment ?? ''}
            onChange={(e) => handlePaymentChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Plaćanje: svi</option>
            {PAYMENT_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>

          {/* Both options name the year, because both narrow within it: a
              returning or first-time upis is a fact about one school year. */}
          <select
            value={currentReturning ?? ''}
            onChange={(e) => handleReturningChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Svi polaznici</option>
            <option value="RETURNING">
              {RETURNING_FILTER_LABELS.RETURNING} {returningYear}
            </option>
            <option value="NEW">
              {RETURNING_FILTER_LABELS.NEW} {returningYear}
            </option>
          </select>
        </div>
      )}
    </div>
  )
}
