'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActiveStudent } from '@/lib/auth-guard'
import { buildGroupGalleryView } from '@/lib/group-gallery-view'


export async function getGroupGalleryForStudent(groupId: string) {
  const session = await requireActiveStudent()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  return buildGroupGalleryView(groupId)
}
