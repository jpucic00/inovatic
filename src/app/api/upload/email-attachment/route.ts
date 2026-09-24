import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mimeMatchesBytes } from '@/lib/mime-guard'
import {
  MAX_ATTACHMENT_BYTES,
  cleanAttachmentFilename,
  formatMegabytes,
  isAllowedAttachmentType,
} from '@/lib/email-attachment-rules'
import { sweepStaleDraftAttachments } from '@/lib/email-attachments'

export const runtime = 'nodejs'

/**
 * Some browsers report an empty `type` for Office files, which the multipart
 * encoding then sends as `application/octet-stream` — so both fall back to the
 * extension. A real declared type is never overridden, and the magic-byte check
 * below decides either way.
 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

function resolveMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[ext] ?? ''
}

/**
 * A draft attachment for an /admin/email campaign. Stored in Postgres, not
 * Cloudinary: only this server ever reads it back (the send job and the admin
 * download), so it needs no public URL, and it stays with the rest of the
 * parents' data.
 *
 * The per-campaign limits (count, total size) are enforced when the campaign is
 * sent — this route cannot know which composer a file belongs to. Here only the
 * single file is checked.
 */
export async function POST(req: Request) {
  const session = await auth()
  // A session without a city would stamp a tenant-less row; fail closed.
  const city = session?.user?.city
  if (session?.user?.role !== 'ADMIN' || !city) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Neispravan zahtjev.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Datoteka nije poslana.' }, { status: 400 })
  }

  const mimeType = resolveMimeType(file)
  if (!isAllowedAttachmentType(mimeType)) {
    return NextResponse.json(
      { error: 'Dopuštene su samo PDF, Word, Excel, JPG i PNG datoteke.' },
      { status: 415 },
    )
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `Datoteka je prevelika (najviše ${formatMegabytes(MAX_ATTACHMENT_BYTES)}).` },
      { status: 413 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Datoteka je prazna.' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (!mimeMatchesBytes(mimeType, bytes)) {
    return NextResponse.json(
      { error: 'Sadržaj datoteke ne odgovara njezinoj vrsti.' },
      { status: 415 },
    )
  }

  // Best effort: a failed sweep must not cost the admin their upload.
  await sweepStaleDraftAttachments().catch((err: unknown) => {
    console.error('sweepStaleDraftAttachments failed:', err)
  })

  const row = await db.emailAttachment.create({
    data: {
      city,
      filename: cleanAttachmentFilename(file.name),
      mimeType,
      bytes: bytes.length,
      content: { create: { data: bytes } },
    },
    select: { id: true, filename: true, bytes: true, mimeType: true },
  })

  return NextResponse.json(row)
}
