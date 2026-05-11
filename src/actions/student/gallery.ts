'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { computeSchoolYear } from '@/lib/school-year'
import { getCurrentActiveModule } from '@/lib/active-module'
import type { GalleryView } from '@/actions/teacher/gallery'

export async function getGroupGalleryForStudent(
  groupId: string,
): Promise<GalleryView> {
  const session = await requireStudent()
  const schoolYear = computeSchoolYear()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      course: {
        select: {
          id: true,
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear },
                select: { schoolYear: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
    },
  })
  if (!group) notFound()

  const images = await db.galleryImage.findMany({
    where: { scheduledGroupId: groupId },
    orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      url: true,
      publicId: true,
      width: true,
      height: true,
      caption: true,
      sortOrder: true,
      moduleId: true,
      createdAt: true,
    },
  })

  const activeModule = getCurrentActiveModule(group.course.modules, schoolYear)

  return {
    group: {
      id: group.id,
      name: group.name,
      course: {
        id: group.course.id,
        title: group.course.title,
        isCustom: group.course.isCustom,
      },
    },
    modules: group.course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
    })),
    images,
    activeModuleId: activeModule?.id ?? null,
  }
}
