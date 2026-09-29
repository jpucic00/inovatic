'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActivePortalChild } from '@/lib/auth-guard'
import { buildGroupGalleryView } from '@/lib/group-gallery-view'


export async function getGroupGalleryForStudent(groupId: string) {
  const { studentId } = await requireActivePortalChild()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: studentId, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  return buildGroupGalleryView(groupId)
}
