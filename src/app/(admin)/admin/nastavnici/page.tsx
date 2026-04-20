import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth-guard'
import { getTeachers } from '@/actions/admin/teacher'
import { CreateTeacherDialog } from '@/components/admin/teachers/create-teacher-dialog'
import { Pagination } from '@/components/admin/pagination'
import { Mail, Phone, ExternalLink } from 'lucide-react'

export const metadata: Metadata = { title: 'Admin – Nastavnici' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function TeachersPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const params = await searchParams
  const search = params.search ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const result = await getTeachers({ search, page, pageSize: PAGE_SIZE })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nastavnici</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ukupno {result.total} nastavnik{result.total === 1 ? '' : 'a'}
          </p>
        </div>
        <CreateTeacherDialog />
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Pretraži po imenu, prezimenu ili e-mailu..."
          className="w-full md:w-80 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </form>

      {result.data.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-400 italic">
            {search ? 'Nema nastavnika koji odgovaraju pretrazi.' : 'Još nema nastavnika.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Nastavnik
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Kontakt
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Grupe
                </th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                  Akcije
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.data.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/nastavnici/${t.id}`}
                      className="font-medium text-gray-900 hover:text-cyan-700"
                    >
                      {t.firstName} {t.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <a
                        href={`mailto:${t.email}`}
                        className="hover:text-cyan-700"
                      >
                        {t.email}
                      </a>
                    </div>
                    {t.phone && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {t.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {t.teacherAssignments.length === 0 ? (
                      <span className="text-gray-400 italic">Nema dodjela</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {t.teacherAssignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-block text-xs bg-cyan-50 text-cyan-700 border border-cyan-200 rounded px-2 py-0.5"
                          >
                            {a.scheduledGroup.name ?? a.scheduledGroup.course.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/nastavnici/${t.id}`}
                      className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:text-cyan-900"
                    >
                      Detalji <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/admin/nastavnici"
        searchParams={params}
        total={result.total}
        pageSize={PAGE_SIZE}
        currentPage={page}
      />
    </div>
  )
}
