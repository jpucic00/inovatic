import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMyManageableMaterials } from '@/actions/teacher/my-materials'
import { StaffMaterialList } from '@/components/material/staff-material-list'

export const metadata: Metadata = { title: 'Moji materijali' }

export default async function TeacherMaterialsPage() {
  const rows = await getMyManageableMaterials()

  return (
    <div>
      <Link
        href="/nastavnik"
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na moje grupe
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moji materijali</h1>
        <p className="text-sm text-gray-500 mt-1">
          Svi materijali nad kojima imate ovlasti — iz svih svojih grupa i programa. Za dodavanje
          novog materijala otvorite grupu.
        </p>
      </header>

      <StaffMaterialList
        rows={rows}
        emptyLabel="Još nema materijala. Otvorite grupu i dodajte prvi materijal."
      />
    </div>
  )
}
