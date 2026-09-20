import Link from 'next/link'
import { ChevronRight, Layers } from 'lucide-react'
import type { ClassroomProgram } from '@/actions/classroom'
import { croatianPlural } from '@/lib/format'

/**
 * Step one for the shared classroom login: pick the program. One tile per
 * program that has a current-year group in this city, with the count of groups
 * waiting behind it. No auto-redirect even for a single program — on a
 * classroom PC the teacher picks deliberately, and the tiles are the
 * confirmation of which city the account is on.
 */
export function ClassroomPrograms({ programs }: Readonly<{ programs: ClassroomProgram[] }>) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Odaberite program</h1>
      <p className="text-sm text-gray-500 mb-6">
        Zatim odaberite grupu — otvaraju se materijali te grupe.
      </p>

      {programs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-500">
          Trenutno nema aktivnih grupa u ovoj školskoj godini.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {programs.map(({ course, groupCount }) => (
            <Link
              key={course.id}
              href={`/portal/program/${course.id}`}
              className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 transition hover:border-cyan-400 hover:shadow-sm"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                <Layers className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold text-gray-900">{course.title}</span>
                <span className="block text-sm text-gray-500">
                  {`${groupCount} ${croatianPlural(groupCount, 'grupa', 'grupe', 'grupa')}`}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
