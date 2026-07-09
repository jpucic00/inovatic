'use server'

import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { buildGroupGalleryView } from '@/lib/group-gallery-view'

export type { GalleryImageRow, GalleryView } from '@/lib/group-gallery-view'

export async function getGroupGallery(groupId: string) {
  await assertTeacherOwnsGroup(groupId)
  return buildGroupGalleryView(groupId)
}
