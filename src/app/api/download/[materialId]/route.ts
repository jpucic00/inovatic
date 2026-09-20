import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MIME_TO_EXT, sanitiseFilename } from '@/lib/cloudinary-url'
import { canManageMaterial, materialTarget } from '@/lib/material-access'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'
import { classroomGroupWhere } from '@/lib/classroom-access'
import type { City } from '@prisma/client'

export const runtime = 'nodejs'

type VisibilityGroup = {
  id: string
  course: { id: string; modules: { id: string }[] }
}

const VISIBILITY_GROUP_SELECT = {
  id: true,
  course: { select: { id: true, modules: { select: { id: true } } } },
} as const

/** Whether the material is effectively visible in at least one of `groups`. */
async function materialVisibleInGroups(
  groups: VisibilityGroup[],
  materialId: string,
): Promise<boolean> {
  if (groups.length === 0) return false

  const whereClauses = groups.map((g) =>
    buildEffectiveMaterialsWhere({
      scheduledGroupId: g.id,
      courseId: g.course.id,
      moduleIds: g.course.modules.map((m) => m.id),
    }),
  )

  const visible = await db.material.findFirst({
    where: { AND: [{ id: materialId }, { OR: whereClauses }] },
    select: { id: true },
  })
  return visible !== null
}

/**
 * A student may download a material iff they are CURRENTLY in a program and the
 * material is visible in one of their groups.
 *
 * The active check is what stops an alum pulling files: this route authorises
 * off a session, so without it "no longer part of any program" would hold at the
 * login form and not here, for as long as a JWT minted while they were still
 * enrolled survives (`revalidateTokenClaims` evicts within ~60s).
 *
 * Their group list stays deliberately unfiltered by year. An enrolled child
 * re-downloading something from their own previous group is legitimate; it is
 * being enrolled at all that is the question.
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
    select: { scheduledGroup: { select: VISIBILITY_GROUP_SELECT } },
  })
  return materialVisibleInGroups(
    enrollments.map((e) => e.scheduledGroup),
    materialId,
  )
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
  return materialVisibleInGroups(groups, materialId)
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
    },
  })

  if (!material?.fileUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const role = session.user.role
  let allowed = false

  if (role === 'ADMIN') {
    if (material.scheduledGroupId) {
      // GROUP materials are per-city; MODULE/COURSE curriculum stays shared.
      const group = await db.scheduledGroup.findUnique({
        where: { id: material.scheduledGroupId },
        select: { city: true },
      })
      allowed = group !== null && group.city === session.user.city
    } else {
      allowed = true
    }
  } else if (role === 'TEACHER') {
    const target = materialTarget(material)
    allowed = target !== null && (await canManageMaterial(session, target))
  } else if (role === 'STUDENT') {
    allowed = await studentAllowed(session.user.id, materialId)
  } else if (role === 'CLASSROOM') {
    allowed = await classroomAllowed(session.user.city, materialId)
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
