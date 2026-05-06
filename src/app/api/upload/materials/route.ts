import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'
import type { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'

export const runtime = 'nodejs'

// Materials are rarely huge (PDF/PPT/DOC + occasional video). Cloudinary's
// free tier caps individual video at 100 MB; non-video at 25–50 MB depending
// on account. We enforce 50 MB here — the "large video" story is solved by
// pasting an external YouTube/Vimeo URL instead of uploading.
const MAX_BYTES = 50 * 1024 * 1024

const DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
])
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

type ResourceType = 'raw' | 'image' | 'video'

function resourceTypeFor(mime: string): ResourceType | null {
  if (DOC_TYPES.has(mime)) return 'raw'
  if (IMAGE_TYPES.has(mime)) return 'image'
  if (VIDEO_TYPES.has(mime)) return 'video'
  return null
}

function folderFor(ownerUserId: string): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `materials/${d.getFullYear()}/${mm}/${ownerUserId}`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'TEACHER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const resourceType = resourceTypeFor(file.type)
  if (!resourceType) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}` },
      { status: 415 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1_048_576} MB)` },
      { status: 413 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: folderFor(session.user.id),
        resource_type: resourceType,
        // Raw uploads keep the original filename in the public_id for cleaner
        // download URLs. Images/videos rely on Cloudinary's generated id.
        use_filename: resourceType === 'raw',
        unique_filename: true,
      },
      (err: UploadApiErrorResponse | undefined, res: UploadApiResponse | undefined) => {
        if (err) reject(err)
        else if (res) resolve(res)
        else reject(new Error('Cloudinary returned no result'))
      },
    )
    upload.end(bytes)
  }).catch((err: unknown) => {
    console.error('Cloudinary material upload failed:', err)
    return null
  })

  if (!result) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 })
  }

  return NextResponse.json({
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
    resourceType,
    mimeType: file.type,
  })
}
