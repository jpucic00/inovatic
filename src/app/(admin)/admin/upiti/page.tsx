import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import Link from 'next/link'
import { getInquiries, getInquiryCourses, getInquiryTabCounts } from '@/actions/admin/inquiry'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { InquiryFilters } from '@/components/admin/inquiries/inquiry-filters'
import { InquiryTable } from '@/components/admin/inquiries/inquiry-table'
import { WaitlistTable } from '@/components/admin/inquiries/waitlist-table'
import { cn } from '@/lib/utils'
import { Pagination } from '@/components/admin/pagination'
import {
  ListFilterMemory,
  type ActiveFilterChip,
} from '@/components/admin/list-filter-memory'
import { InquiryStatus, InquiryType } from '@prisma/client'
import { GRADE_VALUES, GRADE_LABELS, type Grade } from '@/lib/inquiry-status'
import {
  parseReturningFilter,
  RETURNING_FILTER_LABELS,
  type ReturningFilter,
} from '@/lib/returning-filter'

export const metadata: Metadata = { title: 'Admin – Upiti' }

const VALID_STATUSES = Object.values(InquiryStatus) as string[]
const VALID_TYPES = Object.values(InquiryType) as string[]
const VALID_GRADES = GRADE_VALUES as readonly string[]
const PAGE_SIZE = 20

// `?view=cekanje` selects the Lista čekanja tab. A URL param, not React state,
// so ListFilterMemory, BackToListLink and browser Back all carry it.
const WAITLIST_VIEW = 'cekanje'

const STATUS_LABELS: Record<InquiryStatus, string> = {
  NEW: 'Nove',
  ACCOUNT_CREATED: 'Račun stvoren',
  DECLINED: 'Odbijene',
  PARTY_SCHEDULED: 'Proslava dogovorena',
}

interface PageProps {
  searchParams: Promise<{ status?: string; search?: string; course?: string; grade?: string; type?: string; returning?: string; view?: string; page?: string }>
}

export default async function InquiriesPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const selectedYear = await getSelectedSchoolYear()

  const params = await searchParams
  const { status, search, course, grade, type, returning, view, page: pageParam } = params
  const isWaitlistView = view === WAITLIST_VIEW

  const statusFilter =
    status && VALID_STATUSES.includes(status) ? (status as InquiryStatus) : undefined

  const gradeFilter =
    grade && VALID_GRADES.includes(grade) ? (grade as Grade) : undefined

  const typeFilter =
    type && VALID_TYPES.includes(type) ? (type as InquiryType) : undefined

  const returningFilter = parseReturningFilter(returning)

  const currentPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const [{ data: inquiries, total }, courses, tabCounts] = await Promise.all([
    getInquiries({
      status: statusFilter ?? 'ALL',
      search: search?.trim() || undefined,
      courseId: course || undefined,
      grade: gradeFilter,
      type: typeFilter ?? 'ALL',
      returning: returningFilter,
      view: isWaitlistView ? 'WAITLIST' : 'ALL',
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
    getInquiryCourses(),
    getInquiryTabCounts(),
  ])

  const currentStatus = status && VALID_STATUSES.includes(status) ? status : 'ALL'
  const currentSearch = search?.trim() ?? ''
  const currentCourse = course ?? ''
  const currentGrade = gradeFilter ?? ''
  const currentType = typeFilter ?? ''

  const chips = buildInquiryChips({
    statusFilter,
    typeFilter,
    currentCourse,
    gradeFilter,
    returningFilter,
    currentSearch,
    courses,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upiti</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total === 1 ? '1 upit' : `${total} upita`} · {selectedYear}
            {currentSearch && ` za "${currentSearch}"`}
          </p>
        </div>
      </div>

      <ListFilterMemory listPath="/admin/upiti" chips={chips} />

      <nav aria-label="Pregled upita" className="flex gap-1 border-b mb-6">
        <TabLink href="/admin/upiti" active={!isWaitlistView} label="Svi upiti" count={tabCounts.all} />
        <TabLink
          href={`/admin/upiti?view=${WAITLIST_VIEW}`}
          active={isWaitlistView}
          label="Lista čekanja"
          count={tabCounts.waitlist}
        />
      </nav>

      <InquiryFilters currentStatus={currentStatus} currentSearch={currentSearch} currentCourse={currentCourse} currentGrade={currentGrade} currentType={currentType} currentReturning={returningFilter ?? ''} currentView={isWaitlistView ? WAITLIST_VIEW : undefined} courses={courses} />

      {isWaitlistView ? <WaitlistTable data={inquiries} /> : <InquiryTable data={inquiries} />}

      <Pagination
        total={total}
        pageSize={PAGE_SIZE}
        currentPage={currentPage}
        searchParams={params}
        basePath="/admin/upiti"
      />
    </div>
  )
}

function TabLink({
  href,
  active,
  label,
  count,
}: Readonly<{ href: string; active: boolean; label: string; count: number }>) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-cyan-600 text-cyan-700'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
      )}
    >
      {label}
      <span className="ml-1.5 text-xs text-gray-400 tabular-nums">{count}</span>
    </Link>
  )
}

/**
 * Chip labels resolved to what the admin actually picked — an id only ever
 * shows as itself when its row no longer resolves, so the chip (and its ×)
 * never vanishes while the filter still narrows the table.
 */
function buildInquiryChips(args: {
  statusFilter: InquiryStatus | undefined
  typeFilter: InquiryType | undefined
  currentCourse: string
  gradeFilter: Grade | undefined
  returningFilter: ReturningFilter | undefined
  currentSearch: string
  courses: ReadonlyArray<{ id: string; title: string }>
}): ActiveFilterChip[] {
  const { statusFilter, typeFilter, currentCourse, gradeFilter, returningFilter, currentSearch, courses } = args
  return [
    statusFilter && { key: 'status', label: `Status: ${STATUS_LABELS[statusFilter]}` },
    returningFilter && {
      key: 'returning',
      label: `Polaznici: ${RETURNING_FILTER_LABELS[returningFilter]}`,
    },
    typeFilter && {
      key: 'type',
      label: `Vrsta: ${typeFilter === 'COURSE' ? 'Upisi' : 'Proslave'}`,
    },
    currentCourse && {
      key: 'course',
      label:
        currentCourse === 'NONE'
          ? 'Bez preference programa'
          : `Program: ${courses.find((c) => c.id === currentCourse)?.title ?? currentCourse}`,
    },
    gradeFilter && { key: 'grade', label: `Razred: ${GRADE_LABELS[gradeFilter]}` },
    currentSearch && { key: 'search', label: `Pretraga: „${currentSearch}”` },
  ].filter((c): c is ActiveFilterChip => Boolean(c))
}
