import type { Metadata } from 'next'
import { getGroupGalleryForStudent } from '@/actions/student/gallery'
import { GalleryTabsAndGrid } from '@/components/gallery/gallery-tabs-and-grid'

export const metadata: Metadata = { title: 'Galerija grupe' }

export default async function PortalGroupGalerijaPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getGroupGalleryForStudent(groupId)
  return <GalleryTabsAndGrid view={view} canManage={false} />
}
