import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getGroupGalleryForStudent } from '@/actions/student/gallery'
import { GalleryTabsAndGrid } from '@/components/gallery/gallery-tabs-and-grid'

export const metadata: Metadata = { title: 'Galerija grupe' }

export default async function PortalGroupGalerijaPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getGroupGalleryForStudent(groupId)
  const { group } = view

  return (
    <div>
      <Link
        href={`/portal/grupa/${group.id}`}
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na materijale
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Galerija grupe</h1>
        <p className="text-sm text-gray-500 mt-1">
          {group.course.title}
          {group.name ? ` – ${group.name}` : ''}
        </p>
      </header>

      <GalleryTabsAndGrid view={view} canManage={false} />
    </div>
  )
}
