import type { Metadata } from 'next'
import { requireAdminCtx } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { getStudents } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { getGroups } from '@/actions/admin/group'
import { getAllSchoolYears } from '@/actions/admin/school-year'
import { StudentFilters } from '@/components/admin/students/student-filters'
import { StudentTable } from '@/components/admin/students/student-table'
import { CreateStudentDialog } from '@/components/admin/students/create-student-dialog'
import { Pagination } from '@/components/admin/pagination'
import { PAYMENT_FILTER_VALUES, type PaymentFilter } from '@/lib/payment-status'

export const metadata: Metadata = { title: 'Admin – Učenici' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  const { city } = await requireAdminCtx()

  const params = await searchParams
  const search = params.search ?? ''
  const courseId = params.courseId ?? ''
  const groupId = params.groupId ?? ''
  const scheduleId = params.scheduleId ?? ''
  const year = params.year ?? ''
  const paymentStatus = PAYMENT_FILTER_VALUES.includes(params.payment as PaymentFilter)
    ? (params.payment as PaymentFilter)
    : undefined
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const isModuleView = !!scheduleId

  const groupFilter = courseId ? { courseId } : {}
  const [result, courses, groups, scheduleInfo, years] = await Promise.all([
    getStudents({
      search,
      courseId,
      groupId,
      scheduleId: scheduleId || undefined,
      schoolYear: year || undefined,
      paymentStatus,
      page,
      pageSize: PAGE_SIZE,
    }),
    isModuleView ? Promise.resolve([]) : getCourses(),
    isModuleView ? Promise.resolve([]) : getGroups(groupFilter),
    scheduleId
      ? db.moduleSchedule.findFirst({
          where: { id: scheduleId, city },
          select: {
            schoolYear: true,
            module: { select: { title: true, course: { select: { title: true } } } },
          },
        })
      : Promise.resolve(null),
    isModuleView ? Promise.resolve<string[]>([]) : getAllSchoolYears(),
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
          currentPayment: paymentStatus ?? '',
          currentYear: year,
          courses: courses.map((c) => ({ id: c.id, title: c.title })),
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            course: g.course,
          })),
          years,
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
