import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  total: number
  pageSize: number
  currentPage: number
  /** All current URL search params so links preserve filters. */
  searchParams: Record<string, string | string[] | undefined>
  basePath: string
}

function buildUrl(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page') continue
    if (Array.isArray(value)) {
      value.forEach((v) => sp.append(key, v))
    } else if (value != null) {
      sp.set(key, value)
    }
  }
  if (page > 1) sp.set('page', String(page))
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Returns page numbers with ellipsis markers. */
function getPages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '…')[] = [1]

  if (current > 3) pages.push('…')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('…')

  pages.push(total)
  return pages
}

export function Pagination({
  total,
  pageSize,
  currentPage,
  searchParams,
  basePath,
}: PaginationProps) {
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return null

  const from = (currentPage - 1) * pageSize + 1
  const to = Math.min(currentPage * pageSize, total)
  const pages = getPages(currentPage, pageCount)

  const prevHref =
    currentPage > 1 ? buildUrl(basePath, searchParams, currentPage - 1) : null
  const nextHref =
    currentPage < pageCount ? buildUrl(basePath, searchParams, currentPage + 1) : null

  return (
    <div className="flex items-center justify-between mt-6">
      <p className="text-sm text-gray-500">
        {from}–{to} od {total}
      </p>

      <nav className="flex items-center gap-1" aria-label="Paginacija">
        {prevHref ? (
          <Link
            href={prevHref}
            className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
            aria-label="Prethodna stranica"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : (
          <span className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-100 text-gray-300 cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </span>
        )}

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-gray-400 select-none">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildUrl(basePath, searchParams, p)}
              className={cn(
                'min-w-[2rem] text-center px-2 py-1.5 text-sm rounded-md border transition-colors',
                p === currentPage
                  ? 'bg-cyan-600 text-white border-cyan-600 font-medium pointer-events-none'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400',
              )}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </Link>
          ),
        )}

        {nextHref ? (
          <Link
            href={nextHref}
            className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
            aria-label="Sljedeća stranica"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <span className="flex items-center px-2 py-1.5 text-sm rounded-md border border-gray-100 text-gray-300 cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </nav>
    </div>
  )
}
