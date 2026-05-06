'use server'

import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'

/**
 * Every material the logged-in teacher can manage:
 *   - GROUP materials on any group they're assigned to
 *   - MODULE materials of any course they teach at least one group of
 *   - COURSE materials of any radionica they teach
 * Admins see everything (no teacher filter). Used by the "Moji materijali"
 * aggregated view.
 */
export async function getMyManageableMaterials(): Promise<StaffMaterialRow[]> {
  const session = await requireTeacher()
  const isAdmin = session.user.role === 'ADMIN'

  let courseIds: string[] = []
  let groupIds: string[] = []

  if (isAdmin) {
    // Admin sees all.
    const [courses, groups] = await Promise.all([
      db.course.findMany({ select: { id: true } }),
      db.scheduledGroup.findMany({ select: { id: true } }),
    ])
    courseIds = courses.map((c) => c.id)
    groupIds = groups.map((g) => g.id)
  } else {
    const assignments = await db.teacherAssignment.findMany({
      where: { userId: session.user.id },
      include: { scheduledGroup: { select: { id: true, courseId: true } } },
    })
    groupIds = assignments.map((a) => a.scheduledGroup.id)
    courseIds = Array.from(new Set(assignments.map((a) => a.scheduledGroup.courseId)))
  }

  // Module IDs for MODULE-scope materials (across any course the teacher
  // teaches).
  const moduleRows = courseIds.length > 0
    ? await db.courseModule.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true, title: true, course: { select: { id: true, title: true, isCustom: true } } },
      })
    : []
  const moduleIds = moduleRows.map((m) => m.id)
  const moduleMeta = new Map(moduleRows.map((m) => [m.id, m]))

  const courseMeta = courseIds.length > 0
    ? await db.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, isCustom: true },
      })
    : []
  const courseTitleById = new Map(courseMeta.map((c) => [c.id, c.title]))

  const groupMeta = groupIds.length > 0
    ? await db.scheduledGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true, course: { select: { title: true } } },
      })
    : []
  const groupLabelById = new Map(
    groupMeta.map((g) => [g.id, g.name ? `${g.course.title} – ${g.name}` : g.course.title]),
  )

  if (courseIds.length === 0 && groupIds.length === 0) return []

  const materials = await db.material.findMany({
    where: {
      OR: [
        ...(groupIds.length > 0 ? [{ scope: 'GROUP' as const, scheduledGroupId: { in: groupIds } }] : []),
        ...(moduleIds.length > 0 ? [{ scope: 'MODULE' as const, moduleId: { in: moduleIds } }] : []),
        ...(courseIds.length > 0 ? [{ scope: 'COURSE' as const, courseId: { in: courseIds } }] : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      uploadedBy: { select: { firstName: true, lastName: true } },
    },
  })

  return materials.map((m) => {
    const mod = m.moduleId ? moduleMeta.get(m.moduleId) : null
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      type: m.type,
      scope: m.scope,
      fileUrl: m.fileUrl,
      externalUrl: m.externalUrl,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      sortOrder: m.sortOrder,
      moduleTitle: mod ? `${mod.course.title} – ${mod.title}` : null,
      courseTitle: m.scope === 'COURSE' && m.courseId ? courseTitleById.get(m.courseId) ?? null : null,
      groupName: m.scope === 'GROUP' && m.scheduledGroupId ? groupLabelById.get(m.scheduledGroupId) ?? null : null,
      uploadedBy: m.uploadedBy ? `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}` : null,
    }
  })
}
