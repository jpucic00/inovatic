import { getGroupGallery } from '@/actions/teacher/gallery'
import { GalleryTabsAndGrid } from '@/components/gallery/gallery-tabs-and-grid'

export async function GroupGalleryPanel({
  groupId,
  editable,
}: Readonly<{ groupId: string; editable: boolean }>) {
  const view = await getGroupGallery(groupId)

  return (
    <div className="bg-white rounded-xl border p-6 mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Galerija</h2>
      <GalleryTabsAndGrid view={view} canManage={editable} />
    </div>
  )
}
