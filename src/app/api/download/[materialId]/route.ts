import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MIME_TO_EXT, sanitiseFilename } from '@/lib/cloudinary-url'

export const runtime = 'nodejs'

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
    select: { fileUrl: true, title: true, mimeType: true },
  })

  if (!material?.fileUrl) {
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
