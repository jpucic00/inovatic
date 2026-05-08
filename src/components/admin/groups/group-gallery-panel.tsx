import { getGroupGallery } from '@/actions/teacher/gallery'
import { GalleryTabsAndGrid } from '@/components/gallery/gallery-tabs-and-grid'

export async function GroupGalleryPanel({
  groupId,
}: Readonly<{ groupId: string }>) {
  const view = await getGroupGallery(groupId)

  return (
    <div className="bg-white rounded-xl border p-6 mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Galerija</h2>
      <GalleryTabsAndGrid view={view} canManage={true} />
    </div>
  )
}
