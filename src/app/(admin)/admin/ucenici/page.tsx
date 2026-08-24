import type { Metadata } from 'next'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { db } from '@/lib/db'
import { getStudents } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { getGroups } from '@/actions/admin/group'
import { StudentFilters } from '@/components/admin/students/student-filters'
import { StudentTable } from '@/components/admin/students/student-table'
import { CreateStudentDialog } from '@/components/admin/students/create-student-dialog'
import { Pagination } from '@/components/admin/pagination'
import {
  ListFilterMemory,
  type ActiveFilterChip,
} from '@/components/admin/list-filter-memory'
import {
  PAYMENT_FILTER_VALUES,
  PAYMENT_STATUS_LABELS,
  type PaymentFilter,
} from '@/lib/payment-status'
import {
  parseReturningFilter,
  RETURNING_FILTER_LABELS,
  type ReturningFilter,
} from '@/lib/returning-filter'

export const metadata: Metadata = { title: 'Admin – Učenici' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  const { city } = await requireAdminCtx()

  // The list follows the sidebar year like every other school-year section —
  // there is no Godina filter and no `?year=`. One year governs the rows, the
  // "Ponovni upis" flags and the Plaćanje badges at once, which is what stops
  // the badge from reporting on a year the table is not showing.
  //
  // The trade the owner accepted: a child with no enrollment in the selected
  // year is not in this list at all, search included. Finding last year's
  // polaznik means switching the year in the sidebar.
  const selectedYear = await getSelectedSchoolYear()

  const params = await searchParams
  const search = params.search ?? ''
  const courseId = params.courseId ?? ''
  const groupId = params.groupId ?? ''
  const scheduleId = params.scheduleId ?? ''
  const paymentStatus = PAYMENT_FILTER_VALUES.includes(params.payment as PaymentFilter)
    ? (params.payment as PaymentFilter)
    : undefined
  const returning = parseReturningFilter(params.returning)
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const isModuleView = !!scheduleId

  const groupFilter = courseId ? { courseId } : {}
  const [result, courses, groups, scheduleInfo] = await Promise.all([
    getStudents({
      search,
      courseId,
      groupId,
      scheduleId: scheduleId || undefined,
      schoolYear: selectedYear,
      paymentStatus,
      returning,
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
  ])

  const chips = buildStudentChips({
    courseId,
    groupId,
    scheduleId,
    search,
    paymentStatus,
    returning,
    courses,
    groups,
    scheduleInfo,
  })

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
            Ukupno {result.total} učenik{result.total === 1 ? '' : 'a'} u {selectedYear}
          </p>
        </div>
        {!isModuleView && (
          <CreateStudentDialog
            courses={courses.map((c) => ({ id: c.id, title: c.title }))}
          />
        )}
      </div>

      <ListFilterMemory listPath="/admin/ucenici" chips={chips} />

      <StudentFilters
        currentSearch={search}
        {...(!isModuleView && {
          currentCourseId: courseId,
          currentGroupId: groupId,
          currentPayment: paymentStatus ?? '',
          currentReturning: returning ?? '',
          returningYear: selectedYear,
          courses: courses.map((c) => ({ id: c.id, title: c.title })),
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            course: g.course,
          })),
        })}
      />

      <StudentTable data={result.data} schoolYear={selectedYear} />

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

/**
 * Ids are what the URL carries, but nothing on screen should say "grupa
 * cme3k9…" — every chip resolves to the label the admin picked, and every one
 * falls back to the raw id: a filter that still narrows the query must always
 * render its chip, or the × on it would be the only way out and it would be
 * gone (a remembered module view whose ModuleSchedule was later deleted is
 * exactly that trap).
 *
 * The school year is deliberately not a chip. It is not a filter the admin set
 * on this page and there is no × that could take it off — the sidebar switcher
 * owns it, and names it.
 */
function buildStudentChips(args: {
  courseId: string
  groupId: string
  scheduleId: string
  search: string
  paymentStatus: PaymentFilter | undefined
  returning: ReturningFilter | undefined
  courses: ReadonlyArray<{ id: string; title: string }>
  groups: ReadonlyArray<{ id: string; name: string | null; course: { title: string } }>
  scheduleInfo: { module: { title: string; course: { title: string } } } | null
}): ActiveFilterChip[] {
  const { courseId, groupId, scheduleId, search, paymentStatus, returning, courses, groups, scheduleInfo } =
    args
  const selectedGroup = groups.find((g) => g.id === groupId)
  return [
    returning && { key: 'returning', label: RETURNING_FILTER_LABELS[returning] },
    courseId && {
      key: 'courseId',
      label: `Program: ${courses.find((c) => c.id === courseId)?.title ?? courseId}`,
    },
    groupId && {
      key: 'groupId',
      label: `Grupa: ${selectedGroup ? (selectedGroup.name ?? selectedGroup.course.title) : groupId}`,
    },
    paymentStatus && {
      key: 'payment',
      label: PAYMENT_STATUS_LABELS[paymentStatus],
    },
    scheduleId && {
      key: 'scheduleId',
      label: scheduleInfo
        ? `Modul: ${scheduleInfo.module.course.title} – ${scheduleInfo.module.title}`
        : `Modul: ${scheduleId}`,
    },
    search && { key: 'search', label: `Pretraga: „${search}”` },
  ].filter((c): c is ActiveFilterChip => Boolean(c))
}
