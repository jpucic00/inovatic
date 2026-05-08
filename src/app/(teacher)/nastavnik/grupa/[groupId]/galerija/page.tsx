import type { Metadata } from 'next'
import { getGroupGallery } from '@/actions/teacher/gallery'
import { GalleryTabsAndGrid } from '@/components/gallery/gallery-tabs-and-grid'

export const metadata: Metadata = { title: 'Galerija grupe' }

export default async function TeacherGroupGalerijaPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getGroupGallery(groupId)
  return <GalleryTabsAndGrid view={view} canManage={true} />
}
