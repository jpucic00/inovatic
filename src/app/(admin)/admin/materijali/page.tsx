import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getMyManageableMaterials } from '@/actions/teacher/my-materials'
import { StaffMaterialList } from '@/components/material/staff-material-list'

export const metadata: Metadata = { title: 'Admin – Materijali' }

interface PageProps {
  searchParams: Promise<{ scope?: string; type?: string; q?: string }>
}

export default async function AdminMaterialsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const params = await searchParams

  const allRows = await getMyManageableMaterials()

  const scopeFilter = params.scope?.toUpperCase()
  const typeFilter = params.type?.toUpperCase()
  const q = params.q?.toLowerCase().trim() ?? ''

  const rows = allRows.filter((r) => {
    if (scopeFilter && r.scope !== scopeFilter) return false
    if (typeFilter && r.type !== typeFilter) return false
    if (q) {
      const hay = `${r.title} ${r.description ?? ''} ${r.moduleTitle ?? ''} ${r.courseTitle ?? ''} ${r.groupName ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const total = allRows.length
  const shown = rows.length

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Materijali</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ukupno {total} materijala · prikazano {shown}. Za dodavanje materijala otvorite grupu u
          admin panelu ili nastavničkom panelu.
        </p>
      </header>

      <form className="mb-6 flex flex-wrap gap-2 items-end" action="/admin/materijali">
        <div>
          <label htmlFor="mat-filter-q" className="block text-xs font-medium text-gray-500 mb-1">Pretraži</label>
          <input
            id="mat-filter-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder="naslov, opis, program…"
            className="px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div>
          <label htmlFor="mat-filter-scope" className="block text-xs font-medium text-gray-500 mb-1">Razina</label>
          <select
            id="mat-filter-scope"
            name="scope"
            defaultValue={params.scope ?? ''}
            className="px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Sve</option>
            <option value="MODULE">Modul</option>
            <option value="COURSE">Radionica</option>
            <option value="GROUP">Grupa</option>
          </select>
        </div>
        <div>
          <label htmlFor="mat-filter-type" className="block text-xs font-medium text-gray-500 mb-1">Tip</label>
          <select
            id="mat-filter-type"
            name="type"
            defaultValue={params.type ?? ''}
            className="px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Svi</option>
            <option value="DOCUMENT">Dokument</option>
            <option value="PRESENTATION">Prezentacija</option>
            <option value="VIDEO">Video</option>
            <option value="LINK">Poveznica</option>
          </select>
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700"
        >
          Filtriraj
        </button>
      </form>

      <StaffMaterialList rows={rows} emptyLabel="Nema materijala koji odgovaraju filtrima." />
    </div>
  )
}
