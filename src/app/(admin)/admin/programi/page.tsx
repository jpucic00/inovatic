import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, ChevronRight, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getCourses } from '@/actions/admin/course'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { CourseTable } from '@/components/admin/courses/course-table'
import { CourseFormDialog } from '@/components/admin/courses/course-form-dialog'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'

export const metadata: Metadata = { title: 'Admin – Programi' }

export default async function CoursesPage() {
  await requireAdmin()

  const selectedYear = await getSelectedSchoolYear()
  const editable = !isArchivedYear(selectedYear)

  const courses = await getCourses()

  const standard = courses.filter((c) => !c.isCustom)
  const custom = courses.filter((c) => c.isCustom)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Programi</h1>
        <p className="text-gray-500 text-sm mt-1">
          {standard.length} standardnih + {custom.length} radionica · {selectedYear}. Otvorite
          program za module, datume i materijale.
        </p>
      </div>

      {!editable && <ArchivedYearBanner year={selectedYear} />}

      {standard.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Standardni programi (SLR 1–4)
          </h2>
          <div className="space-y-3">
            {standard.map((course) => (
              <Link
                key={course.id}
                href={`/admin/programi/${course.id}`}
                className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-5 hover:border-cyan-400 hover:shadow-sm transition group"
              >
                <BookOpen className="w-6 h-6 text-cyan-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{course.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-400">
                    {course.level && <span>{course.level.replace('_', ' ')}</span>}
                    <span>{course.ageMin}–{course.ageMax} god.</span>
                    <span className="text-gray-300">|</span>
                    <span>{course.modules.length} modula</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-full shrink-0">
                  <Users className="w-3.5 h-3.5" />
                  {course._count.scheduledGroups}{' '}
                  {course._count.scheduledGroups >= 2 && course._count.scheduledGroups <= 4
                    ? 'grupe'
                    : 'grupa'}
                </span>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-cyan-500 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Radionice
          </h2>
          {editable && <CourseFormDialog />}
        </div>
        {custom.length > 0 ? (
          <CourseTable data={custom} editable={editable} />
        ) : (
          <p className="text-sm text-gray-400 italic py-4">Nema radionica.</p>
        )}
      </div>
    </div>
  )
}
