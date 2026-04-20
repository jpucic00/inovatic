import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { getStudents } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { getGroups } from '@/actions/admin/group'
import { StudentFilters } from '@/components/admin/students/student-filters'
import { StudentTable } from '@/components/admin/students/student-table'
import { CreateStudentDialog } from '@/components/admin/students/create-student-dialog'
import { Pagination } from '@/components/admin/pagination'

export const metadata: Metadata = { title: 'Admin – Učenici' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const params = await searchParams
  const search = params.search ?? ''
  const courseId = params.courseId ?? ''
  const groupId = params.groupId ?? ''
  const scheduleId = params.scheduleId ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const isModuleView = !!scheduleId

  const [result, courses, groups, scheduleInfo] = await Promise.all([
    getStudents({
      search,
      courseId,
      groupId,
      scheduleId: scheduleId || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    isModuleView ? Promise.resolve([]) : getCourses(),
    isModuleView ? Promise.resolve([]) : getGroups(courseId ? { courseId } : {}),
    scheduleId
      ? db.moduleSchedule.findUnique({
          where: { id: scheduleId },
          select: {
            schoolYear: true,
            module: { select: { title: true, course: { select: { title: true } } } },
          },
        })
      : Promise.resolve(null),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Učenici
            {scheduleInfo && (
              <span className="text-lg font-normal text-gray-500">
                {' '}&mdash; {scheduleInfo.module.course.title}, {scheduleInfo.module.title} ({scheduleInfo.schoolYear})
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ukupno {result.total} učenik{result.total === 1 ? '' : 'a'}
          </p>
        </div>
        {!isModuleView && (
          <CreateStudentDialog
            courses={courses.map((c) => ({ id: c.id, title: c.title }))}
          />
        )}
      </div>

      <StudentFilters
        currentSearch={search}
        {...(!isModuleView && {
          currentCourseId: courseId,
          currentGroupId: groupId,
          courses: courses.map((c) => ({ id: c.id, title: c.title })),
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            course: g.course,
          })),
        })}
      />

      <StudentTable data={result.data} />

      <Pagination
        basePath="/admin/ucenici"
        searchParams={params}
        total={result.total}
        pageSize={PAGE_SIZE}
        currentPage={page}
      />
    </div>
  )
}
