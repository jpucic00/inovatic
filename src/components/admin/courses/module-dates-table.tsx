import { Users, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/format'
import Link from 'next/link'

type Module = {
  id: string
  title: string
  sortOrder: number
  scheduleId: string | null
  startDate: Date | null
  endDate: Date | null
  enrollmentCount: number
}

type CourseInfo = {
  id: string
  title: string
  level: string | null
  ageMin: number
  ageMax: number
  equipment: string | null
  groupCount: number
}

interface ModuleDatesTableProps {
  course: CourseInfo
  modules: Module[]
  /** Hide the course title/level header block (when the page already shows it). */
  hideHeader?: boolean
}

function getModuleStatus(mod: Module): { label: string; className: string } {
  const now = new Date()
  if (!mod.startDate || !mod.endDate) return { label: 'Nema datuma', className: 'text-gray-400' }
  if (now < new Date(mod.startDate)) return { label: 'Nadolazi', className: 'text-blue-600 bg-blue-50' }
  if (now > new Date(mod.endDate)) return { label: 'Završen', className: 'text-gray-500 bg-gray-100' }
  return { label: 'Aktivan', className: 'text-green-700 bg-green-50' }
}

function ModuleRow({ mod }: Readonly<{ mod: Module }>) {
  const status = getModuleStatus(mod)

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2.5 pr-4">
        <span className="text-sm text-gray-800">{mod.title}</span>
      </td>
      <td className="py-2.5 pr-4">
        <span className="text-sm text-gray-600">{formatDate(mod.startDate) || '–'}</span>
      </td>
      <td className="py-2.5 pr-4">
        <span className="text-sm text-gray-600">{formatDate(mod.endDate) || '–'}</span>
      </td>
      <td className="py-2.5 pr-4">
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className="py-2.5">
        {mod.scheduleId ? (
          <Link
            href={`/admin/ucenici?scheduleId=${mod.scheduleId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-md hover:bg-cyan-100 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {mod.enrollmentCount} {mod.enrollmentCount === 1 ? 'polaznik' : 'polaznika'}
          </Link>
        ) : (
          <span className="text-xs text-gray-400">–</span>
        )}
      </td>
    </tr>
  )
}

export function ModuleDatesTable({
  course,
  modules,
  hideHeader,
}: Readonly<ModuleDatesTableProps>) {
  if (modules.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      {!hideHeader && (
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Calendar className="w-5 h-5 text-cyan-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{course.title}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {course.level && (
                <span className="text-xs text-gray-500">{course.level.replace('_', ' ')}</span>
              )}
              <span className="text-xs text-gray-400">{course.ageMin}–{course.ageMax} god.</span>
              {course.equipment && (
                <>
                  <span className="text-xs text-gray-300">|</span>
                  <span className="text-xs text-gray-400">{course.equipment}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/admin/grupe?tab=${course.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-full hover:bg-cyan-100 transition-colors shrink-0"
        >
          <Users className="w-3.5 h-3.5" />
          {course.groupCount} {course.groupCount >= 2 && course.groupCount <= 4 ? 'grupe' : 'grupa'}
        </Link>
      </div>
      )}
      <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Modul</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Početak</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Završetak</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Status</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2">Polaznici</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((mod) => (
            <ModuleRow key={mod.id} mod={mod} />
          ))}
        </tbody>
      </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Datumi se računaju iz početka školske godine i praznika i mijenjaju se sami kad se
        praznici promijene. Uređuju se na stranici{' '}
        <Link href="/admin/skolska-godina" className="text-cyan-700 hover:underline">
          Kalendar
        </Link>
        .
      </p>
    </div>
  )
}
