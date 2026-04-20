import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getCourses } from '@/actions/admin/course'
import { getAvailableSchoolYears, ensureSchedulesForYear } from '@/actions/admin/school-year'
import { computeSchoolYear } from '@/lib/school-year'
import { CourseTable } from '@/components/admin/courses/course-table'
import { CreateCourseDialog } from '@/components/admin/courses/create-course-dialog'
import { ModuleDatesTable } from '@/components/admin/courses/module-dates-table'
import { SchoolYearSelector } from '@/components/admin/courses/school-year-selector'

export const metadata: Metadata = { title: 'Admin – Programi' }

interface PageProps {
  searchParams: Promise<{ schoolYear?: string }>
}

export default async function CoursesPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const { schoolYear: yearParam } = await searchParams
  const currentYear = computeSchoolYear()
  const selectedYear = yearParam ?? currentYear

  // Bootstrap current-year module schedules on first visit (fresh DB).
  await ensureSchedulesForYear(currentYear)

  const [courses, years] = await Promise.all([
    getCourses(selectedYear),
    getAvailableSchoolYears(),
  ])

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Standardni programi (SLR 1–4)
            </h2>
            <SchoolYearSelector
              years={years}
              currentYear={currentYear}
              selectedYear={selectedYear}
            />
          </div>
          {standard.map((course) => (
            <ModuleDatesTable
              key={course.id}
              course={{
                id: course.id,
                title: course.title,
                level: course.level,
                ageMin: course.ageMin,
                ageMax: course.ageMax,
                equipment: course.equipment,
                groupCount: course._count.scheduledGroups,
              }}
              modules={course.modules.map((mod) => {
                const schedule = mod.schedules[0] ?? null
                return {
                  id: mod.id,
                  title: mod.title,
                  sortOrder: mod.sortOrder,
                  scheduleId: schedule?.id ?? null,
                  startDate: schedule?.startDate ?? null,
                  endDate: schedule?.endDate ?? null,
                  enrollmentCount: schedule?._count.moduleEnrollments ?? 0,
                }
              })}
            />
          ))}
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
