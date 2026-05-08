'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { computeSchoolYear } from '@/lib/school-year'
import { getCurrentActiveModule } from '@/lib/active-module'

export type GalleryImageRow = {
  id: string
  url: string
  publicId: string
  width: number | null
  height: number | null
  caption: string | null
  sortOrder: number
  moduleId: string | null
  createdAt: Date
}

export type GalleryModule = {
  id: string
  title: string
  sortOrder: number
}

export type GalleryView = {
  group: {
    id: string
    name: string | null
    course: {
      id: string
      title: string
      isCustom: boolean
    }
  }
  modules: GalleryModule[]
  images: GalleryImageRow[]
  activeModuleId: string | null
}

export async function getGroupGallery(groupId: string): Promise<GalleryView> {
  await assertTeacherOwnsGroup(groupId)
  const schoolYear = computeSchoolYear()

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
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
