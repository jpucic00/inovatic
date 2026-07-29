'use server'

import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { buildGroupMaterialsView, type GroupMaterialsView } from '@/lib/group-materials-view'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'

/**
 * Returns every material that applies to this group (MODULE + COURSE + GROUP),
 * including the hidden-in-this-group flag. Unlike the student query, staff
 * see hidden materials (dimmed, with a toggle to re-show) so they can
 * manage them.
 */
export async function getStaffGroupMaterials(groupId: string): Promise<StaffMaterialRow[]> {
  const { session, isAdmin } = await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      course: {
        include: { modules: { select: { id: true, title: true } } },
      },
    },
  })

  const moduleIds = group.course.modules.map((m) => m.id)
  const moduleTitles = new Map(group.course.modules.map((m) => [m.id, m.title]))

  const materials = await db.material.findMany({
    where: {
      OR: [
        { scope: 'GROUP', scheduledGroupId: group.id },
        { scope: 'COURSE', courseId: group.course.id },
        ...(moduleIds.length > 0 ? [{ scope: 'MODULE' as const, moduleId: { in: moduleIds } }] : []),
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      uploadedBy: { select: { firstName: true, lastName: true, deletedAt: true } },
      hiddenInGroups: {
        where: { scheduledGroupId: group.id },
        select: { id: true },
      },
    },
  })

  return materials.map((m) => ({
    id: m.id,
    moduleId: m.moduleId ?? null,
    title: m.title,
    description: m.description,
    type: m.type,
    scope: m.scope,
    fileUrl: m.fileUrl,
    externalUrl: m.externalUrl,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    sortOrder: m.sortOrder,
    moduleTitle: m.scope === 'MODULE' && m.moduleId ? moduleTitles.get(m.moduleId) ?? null : null,
    courseTitle: m.scope === 'COURSE' ? group.course.title : null,
    groupName: m.scope === 'GROUP' ? (group.name ?? 'Ova grupa') : null,
    hiddenInThisGroup: m.hiddenInGroups.length > 0,
    uploadedBy: m.uploadedBy ? `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}` : null,
    uploadedByDeleted: m.uploadedBy?.deletedAt != null,
    uploadedById: m.uploadedById,
    // Inherited MODULE/COURSE program materials are hide-only in a group (edit
    // them on the program page). GROUP materials: admin always; teacher only own.
    canEdit: m.scope === 'GROUP' && (isAdmin || m.uploadedById === session.user.id),
  }))
}

/**
 * Data needed by the per-group materials page to render the upload dialog:
 * the list of modules the teacher can attach MODULE-scope uploads to.
 * For radionice, this returns an empty list and callers should offer COURSE
 * scope instead.
 */
export async function getGroupUploadTargets(groupId: string) {
  await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      course: {
        include: { modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } },
      },
    },
  })

  return {
    groupId: group.id,
    groupName: group.name,
    courseId: group.course.id,
    courseTitle: group.course.title,
    kind: group.course.kind,
    modules: group.course.modules,
  }
}

/**
 * The exact post-hide view a STUDENT of this group sees, for the teacher
 * "scene view" (Pregled) tab. Gated by group ownership (ADMIN bypasses).
 */
export async function getGroupMaterialsViewForStaff(
  groupId: string,
): Promise<GroupMaterialsView> {
  await assertTeacherOwnsGroup(groupId)
  return buildGroupMaterialsView(groupId)
}
