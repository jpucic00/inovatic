import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { attachmentContentDisposition } from '@/lib/content-disposition'

export const runtime = 'nodejs'

/**
 * An /admin/email attachment, for the campaign history. Admin-only and scoped
 * to the admin's city: an id from the other city is indistinguishable from one
 * that does not exist.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth()
  const city = session?.user?.city
  if (session?.user?.role !== 'ADMIN' || !city) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { attachmentId } = await params
  const attachment = await db.emailAttachment.findFirst({
    where: { id: attachmentId, city },
    select: { filename: true, mimeType: true, content: { select: { data: true } } },
  })
  if (!attachment?.content) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data = attachment.content.data
  return new NextResponse(Buffer.from(data), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': attachmentContentDisposition(attachment.filename),
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
