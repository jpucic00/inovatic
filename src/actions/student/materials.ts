'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { computeSchoolYear } from '@/lib/school-year'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'
import { getCurrentActiveModule } from '@/lib/active-module'
import type { MaterialType } from '@prisma/client'

export type MaterialItem = {
  id: string
  title: string
  description: string | null
  type: MaterialType
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
  sortOrder: number
  createdAt: Date
}

export type ModuleMaterialGroup = {
  moduleId: string
  title: string
  sortOrder: number
  isActive: boolean
  materials: MaterialItem[]
}

export type GroupMaterialsView = {
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    course: { id: string; title: string; isCustom: boolean }
    location: { name: string }
    teacherNames: string[]
  }
  /** Per-module sections for standard programs. Empty for radionice. */
  moduleSections: ModuleMaterialGroup[]
  /** Flat bucket: group-scoped materials (and course-scoped for radionice). */
  groupMaterials: MaterialItem[]
  /** Convenience: id of the module the student is likely working on now. */
  activeModuleId: string | null
}

/**
 * Fetches the effective materials for a group that the logged-in student is
 * enrolled in. Throws a 404 if the student has no enrollment for this group —
 * that's the access gate.
 */
export async function getEffectiveMaterialsForStudent(
  groupId: string
): Promise<GroupMaterialsView> {
  const session = await requireStudent()
  const schoolYear = computeSchoolYear()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: { schedules: { where: { schoolYear } } },
          },
        },
      },
      location: true,
      teacherAssignments: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  if (!group) notFound()

  const moduleIds = group.course.modules.map((m) => m.id)
  const activeModule = getCurrentActiveModule(group.course.modules, schoolYear)

  const materials = await db.material.findMany({
    where: buildEffectiveMaterialsWhere({
      scheduledGroupId: group.id,
      courseId: group.course.id,
      courseIsCustom: group.course.isCustom,
      moduleIds,
    }),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const moduleBuckets = new Map<string, MaterialItem[]>()
  const groupBucket: MaterialItem[] = []

  for (const m of materials) {
    const item: MaterialItem = {
      id: m.id,
      title: m.title,
      description: m.description,
      type: m.type,
      fileUrl: m.fileUrl,
      externalUrl: m.externalUrl,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
    }

    if (m.scope === 'MODULE' && m.moduleId) {
      const arr = moduleBuckets.get(m.moduleId) ?? []
      arr.push(item)
      moduleBuckets.set(m.moduleId, arr)
    } else {
      groupBucket.push(item)
    }
  }

  const moduleSections: ModuleMaterialGroup[] = group.course.isCustom
    ? []
    : group.course.modules.map((m) => ({
        moduleId: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        isActive: activeModule?.id === m.id,
        materials: moduleBuckets.get(m.id) ?? [],
      }))

  return {
    group: {
      id: group.id,
      name: group.name,
      dayOfWeek: group.dayOfWeek,
      startTime: group.startTime,
      endTime: group.endTime,
      course: {
        id: group.course.id,
        title: group.course.title,
        isCustom: group.course.isCustom,
      },
      location: { name: group.location.name },
      teacherNames: group.teacherAssignments.map(
        (t) => `${t.user.firstName} ${t.user.lastName}`
      ),
    },
    moduleSections,
    groupMaterials: groupBucket,
    activeModuleId: activeModule?.id ?? null,
  }
}
