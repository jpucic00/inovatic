import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'
import type { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

function monthFolder(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `articles/uploads/${d.getFullYear()}/${mm}`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
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
      { folder: monthFolder(), resource_type: 'image' },
      (err: UploadApiErrorResponse | undefined, res: UploadApiResponse | undefined) => {
        if (err) reject(err)
        else if (res) resolve(res)
        else reject(new Error('Cloudinary returned no result'))
      },
    )
    upload.end(bytes)
  }).catch((err: unknown) => {
    console.error('Cloudinary upload failed:', err)
    return null
  })

  if (!result) {
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 502 },
    )
  }

  return NextResponse.json({
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  })
}
