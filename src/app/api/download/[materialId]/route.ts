import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MIME_TO_EXT, sanitiseFilename } from '@/lib/cloudinary-url'
import { canManageMaterial, materialTarget } from '@/lib/material-access'
import { buildEffectiveMaterialsWhere, type MaterialViewer } from '@/lib/material-query'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'
import { classroomGroupWhere } from '@/lib/classroom-access'
import { teacherGroupAccessWhere } from '@/lib/teacher-guard'
import {
  buildGroupMaterialsView,
  toCurrentLessonOnly,
  viewMaterialIds,
} from '@/lib/group-materials-view'
import type { City } from '@prisma/client'

export const runtime = 'nodejs'

type VisibilityGroup = {
  id: string
  city: City
  course: { id: string; modules: { id: string }[] }
}

const VISIBILITY_GROUP_SELECT = {
  id: true,
  city: true,
  course: { select: { id: true, modules: { select: { id: true } } } },
} as const

/**
 * Whether the material is effectively visible to `viewer` in at least one of
 * `groups`. The STUDENT viewer never matches a TEACHER-audience row — that is
 * what keeps a teacher's preparation out of a parent's or the classroom's hands.
 */
async function materialVisibleInGroups(
  groups: VisibilityGroup[],
  materialId: string,
  viewer: MaterialViewer,
): Promise<boolean> {
  if (groups.length === 0) return false

  const whereClauses = groups.map((g) =>
    buildEffectiveMaterialsWhere({
      scheduledGroupId: g.id,
      courseId: g.course.id,
      moduleIds: g.course.modules.map((m) => m.id),
      viewer,
      city: g.city,
    }),
  )

  const visible = await db.material.findFirst({
    where: { AND: [{ id: materialId }, { OR: whereClauses }] },
    select: { id: true },
  })
  return visible !== null
}

/**
 * A parent may download a material iff the chosen child is CURRENTLY in a
 * program and the material is on the child's portal page of one of their
 * groups — which, since 2026-10-26, is only the CURRENT lesson of each dated
 * section (`toCurrentLessonOnly`, the same cut the page applies). A link to an
 * earlier or later lesson's file therefore stops working once the page stops
 * listing it.
 *
 * The active check is what stops an alum pulling files: this route authorises
 * off a session, so without it "no longer part of any program" would hold at the
 * login form and not here, for as long as a JWT minted while they were still
 * enrolled survives (`revalidateTokenClaims` evicts within ~60s).
 *
 * Their group list stays deliberately unfiltered by year: an enrolled child's
 * previous group still has a page, and what it lists is still theirs.
 */
async function studentAllowed(
  userId: string,
  materialId: string,
): Promise<boolean> {
  const active = await db.enrollment.count({
    where: { userId, ...activeEnrollmentWhere() },
  })
  if (active === 0) return false

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    select: { scheduledGroupId: true },
  })
  // Cheap pre-check first: a material visible in none of the groups at all
  // never needs the per-group lesson placement.
  const groups = await db.scheduledGroup.findMany({
    where: { id: { in: enrollments.map((e) => e.scheduledGroupId) } },
    select: VISIBILITY_GROUP_SELECT,
  })
  if (!(await materialVisibleInGroups(groups, materialId, 'STUDENT'))) return false

  for (const group of groups) {
    const view = toCurrentLessonOnly(await buildGroupMaterialsView(group.id, 'STUDENT'))
    if (viewMaterialIds(view).has(materialId)) return true
  }
  return false
}

/**
 * The shared classroom login has no enrollments; its "groups" are every
 * current-year group of its city (`classroomGroupWhere`), and the material has
 * to be visible in one of them — the same effective-visibility rule as a child.
 */
async function classroomAllowed(city: City, materialId: string): Promise<boolean> {
  const groups = await db.scheduledGroup.findMany({
    where: classroomGroupWhere(city),
    select: VISIBILITY_GROUP_SELECT,
  })
  return materialVisibleInGroups(groups, materialId, 'STUDENT')
}

/**
 * A teacher on a group only through a per-termin change (a zamjena) holds no
 * TeacherAssignment, so `canManageMaterial` refuses them — rightly, since
 * managing materials stays with the regular staff. Reading is another matter:
 * the access window exists so they can prepare with the group's materials, so
 * they may download what is effectively visible in a group they can open.
 */
async function teacherReadAllowed(userId: string, materialId: string): Promise<boolean> {
  const groups = await db.scheduledGroup.findMany({
    where: teacherGroupAccessWhere(userId),
    select: VISIBILITY_GROUP_SELECT,
  })
  return materialVisibleInGroups(groups, materialId, 'STAFF')
}


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { materialId } = await params

  const material = await db.material.findUnique({
    where: { id: materialId },
    select: {
      fileUrl: true,
      title: true,
      mimeType: true,
      scope: true,
      moduleId: true,
      courseId: true,
      scheduledGroupId: true,
      lessonId: true,
      city: true,
    },
  })

  if (!material?.fileUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const role = session.user.role
  let allowed = false

  if (role === 'ADMIN') {
    // The same answer the program and lesson pages give: shared curriculum for
    // either city (a city-only row included — the other city sees it greyed),
    // but a GROUP row or another city's radionica reads as missing.
    const target = materialTarget(material)
    allowed = target !== null && (await canManageMaterial(session, target))
  } else if (role === 'TEACHER') {
    // `canManageMaterial` answers per program, not per city: a Šibenik teacher
    // on SLR 1 would pass it for a Split-only SLR 1 file. The city-aware path
    // (`teacherReadAllowed`, through the groups they can open) still decides.
    const target = materialTarget(material)
    const otherCityOnly = material.city !== null && material.city !== session.user.city
    allowed =
      (!otherCityOnly && target !== null && (await canManageMaterial(session, target))) ||
      (await teacherReadAllowed(session.user.id, materialId))
  } else if (role === 'CLASSROOM') {
    // `city` is typed but may be undefined on a legacy token kept alive through a
    // transient DB error; Prisma reads `city: undefined` as "no filter", which
    // would open BOTH cities. Fail closed, like the ADMIN branch above.
    allowed = !!session.user.city && (await classroomAllowed(session.user.city, materialId))
  }

  // The child a parent (or a staff member who is also a parent) is looking at
  // in the portal. Checked after the staff branches, never instead of them —
  // the picked child can only ever ADD what that child may already open.
  if (!allowed && session.user.studentId) {
    allowed = await studentAllowed(session.user.studentId, materialId)
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const upstream = await fetch(material.fileUrl)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
  }

  const ext = material.mimeType ? (MIME_TO_EXT[material.mimeType] ?? '') : ''
  const filename = sanitiseFilename(material.title) + ext

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': material.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...(upstream.headers.get('content-length')
        ? { 'Content-Length': upstream.headers.get('content-length')! }
        : {}),
    },
  })
}
