import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getInquiries, getInquiryCourses } from '@/actions/admin/inquiry'
import { InquiryFilters } from '@/components/admin/inquiries/inquiry-filters'
import { InquiryTable } from '@/components/admin/inquiries/inquiry-table'
import { Pagination } from '@/components/admin/pagination'
import { InquiryStatus } from '@prisma/client'

export const metadata: Metadata = { title: 'Admin – Upiti' }

const VALID_STATUSES = Object.values(InquiryStatus) as string[]
const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ status?: string; search?: string; course?: string; page?: string }>
}

export default async function InquiriesPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const params = await searchParams
  const { status, search, course, page: pageParam } = params

  const statusFilter =
    status && VALID_STATUSES.includes(status) ? (status as InquiryStatus) : undefined

  const currentPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const [{ data: inquiries, total }, courses] = await Promise.all([
    getInquiries({
      status: statusFilter ?? 'ALL',
      search: search?.trim() || undefined,
      courseId: course || undefined,
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
    getInquiryCourses(),
  ])

  const currentStatus = status && VALID_STATUSES.includes(status) ? status : 'ALL'
  const currentSearch = search?.trim() ?? ''
  const currentCourse = course ?? ''

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upiti</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total === 1 ? '1 upit' : `${total} upita`}
            {currentSearch && ` za "${currentSearch}"`}
          </p>
        </div>
      </div>

      <InquiryFilters currentStatus={currentStatus} currentSearch={currentSearch} currentCourse={currentCourse} courses={courses} />

      <InquiryTable data={inquiries} />

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
