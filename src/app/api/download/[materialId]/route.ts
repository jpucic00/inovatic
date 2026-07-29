import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MIME_TO_EXT, sanitiseFilename } from '@/lib/cloudinary-url'
import { canManageMaterial, materialTarget } from '@/lib/material-access'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'

export const runtime = 'nodejs'

/** A student may download a material iff it is visible in one of their groups. */
async function studentAllowed(
  userId: string,
  materialId: string,
): Promise<boolean> {
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    select: {
      scheduledGroup: {
        select: {
          id: true,
          course: {
            select: {
              id: true,
              modules: { select: { id: true } },
            },
          },
        },
      },
    },
  })
  if (enrollments.length === 0) return false

  const whereClauses = enrollments.map((e) =>
    buildEffectiveMaterialsWhere({
      scheduledGroupId: e.scheduledGroup.id,
      courseId: e.scheduledGroup.course.id,
      moduleIds: e.scheduledGroup.course.modules.map((m) => m.id),
    }),
  )

  const visible = await db.material.findFirst({
    where: { AND: [{ id: materialId }, { OR: whereClauses }] },
    select: { id: true },
  })
  return visible !== null
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
