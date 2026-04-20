import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth-guard'
import { getArticles } from '@/actions/admin/article'
import { Pagination } from '@/components/admin/pagination'
import { Plus, ExternalLink } from 'lucide-react'
import { DeleteArticleButton } from '@/components/admin/articles/delete-article-button'

export const metadata: Metadata = { title: 'Admin – Novosti' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

type StatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT'

function parseStatus(value: string | undefined): StatusFilter {
  if (value === 'PUBLISHED' || value === 'DRAFT') return value
  return 'ALL'
}

export default async function ArticlesAdminPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const params = await searchParams
  const search = params.search ?? ''
  const status = parseStatus(params.status)
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const result = await getArticles({ search, status, page, pageSize: PAGE_SIZE })

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'Svi' },
    { key: 'PUBLISHED', label: 'Objavljeni' },
    { key: 'DRAFT', label: 'Skice' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novosti</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ukupno {result.total} članak{result.total === 1 ? '' : 'a'}
          </p>
        </div>
        <Link
          href="/admin/novosti/nova"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novi članak
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {statusTabs.map((tab) => {
          const isActive = status === tab.key
          const href =
            tab.key === 'ALL'
              ? `/admin/novosti${search ? `?search=${encodeURIComponent(search)}` : ''}`
              : `/admin/novosti?status=${tab.key}${search ? `&search=${encodeURIComponent(search)}` : ''}`
          return (
            <Link
              key={tab.key}
              href={href}
              className={[
                'px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-cyan-600 text-cyan-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <form className="mb-4">
        {status !== 'ALL' && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Pretraži po naslovu ili slugu..."
          className="w-full md:w-80 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </form>

      {result.data.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-400 italic">
            {search ? 'Nema članaka koji odgovaraju pretrazi.' : 'Još nema članaka.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Naslov
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Objavljeno
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Autor
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Oznake
                </th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Akcije
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.data.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/novosti/${a.id}/uredi`}
                      className="font-medium text-gray-900 hover:text-cyan-700"
                    >
                      {a.title}
                    </Link>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      /novosti/{a.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {a.isPublished ? (
                      <span className="inline-block text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5">
                        Objavljen
                      </span>
                    ) : (
                      <span className="inline-block text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded px-2 py-0.5">
                        Skica
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {a.publishedAt
                      ? a.publishedAt.toLocaleDateString('hr-HR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {a.author ? `${a.author.firstName} ${a.author.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {a.tags.length === 0 ? (
                      <span className="text-gray-400 italic text-xs">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.tags.map((t) => (
                          <span
                            key={t.tag.id}
                            className="inline-block text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5"
                          >
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {a.isPublished && (
                        <Link
                          href={`/novosti/${a.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-cyan-600 transition-colors"
                          aria-label="Otvori javnu stranicu"
                          title="Otvori javnu stranicu"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}
                      <DeleteArticleButton
                        articleId={a.id}
                        articleTitle={a.title}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/novosti"
        searchParams={params}
        total={result.total}
        pageSize={PAGE_SIZE}
        currentPage={page}
      />
    </div>
  )
}
