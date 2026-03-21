import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getCourses } from '@/actions/admin/course'
import { CourseTable } from '@/components/admin/courses/course-table'
import { CreateCourseDialog } from '@/components/admin/courses/create-course-dialog'

export const metadata: Metadata = { title: 'Admin – Programi' }

export default async function CoursesPage() {
  await requireAdmin()

  const courses = await getCourses()
  const standard = courses.filter((c) => !c.isCustom)
  const custom = courses.filter((c) => c.isCustom)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Programi</h1>
        <p className="text-gray-500 text-sm mt-1">
          {standard.length} standardnih + {custom.length} radionica
        </p>
      </div>

      {standard.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Standardni programi (SLR 1–4)
          </h2>
          <CourseTable data={standard} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Radionice
          </h2>
          <CreateCourseDialog />
        </div>
        {custom.length > 0 ? (
          <CourseTable data={custom} />
        ) : (
          <p className="text-sm text-gray-400 italic py-4">Nema radionica.</p>
        )}
      </div>


    </div>
  )
}
