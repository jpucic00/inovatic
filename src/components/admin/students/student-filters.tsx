'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

type CourseOption = { id: string; title: string }
type GroupOption = { id: string; name: string | null; course: { title: string } }

interface StudentFiltersProps {
  currentSearch: string
  currentCourseId?: string
  currentGroupId?: string
  courses?: CourseOption[]
  groups?: GroupOption[]
}

export function StudentFilters({
  currentSearch,
  currentCourseId,
  currentGroupId,
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
    // Preserve moduleId if present (coming from module link)
    const moduleId = searchParams.get('moduleId')
    if (moduleId) sp.set('moduleId', moduleId)

    const search = overrides.search ?? searchRef.current?.value ?? ''
    if (search) sp.set('search', search)

    if (showFilters) {
      const courseId = overrides.courseId ?? currentCourseId ?? ''
      const groupId = overrides.groupId ?? currentGroupId ?? ''
      if (courseId) sp.set('courseId', courseId)
      if (groupId) sp.set('groupId', groupId)
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

  // Groups are already filtered server-side by courseId

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
        <div className="flex gap-3">
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
        </div>
      )}
    </div>
  )
}
