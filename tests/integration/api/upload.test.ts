import { describe, expect, it, vi } from 'vitest'
import { hasWatermark, withWatermark } from '@/lib/cloudinary-url'

// Stub Cloudinary so the positive control stays offline. Real-shaped host on
// purpose: `withWatermark` is a no-op on any other hostname, and the assertion
// below exists to prove the route wraps what it returns.
const SECURE_URL =
  'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1700000000/articles/covers/fake.png'
vi.mock('@/lib/cloudinary', () => ({
  default: {
    uploader: {
      upload_stream: (
        _opts: unknown,
        cb: (
          err: undefined,
          res: { secure_url: string; public_id: string; bytes: number; width: number; height: number },
        ) => void,
      ) => ({
        end: (bytes: Buffer) =>
          cb(undefined, {
            secure_url: SECURE_URL,
            public_id: 'articles/covers/fake',
            bytes: bytes.length,
            width: 1,
            height: 1,
          }),
      }),
    },
  },
}))

import { POST } from '@/app/api/upload/route'
import { mockSession } from '../setup'
import { createAdmin, createStudent, createTeacher } from '../helpers/factory'

// First 12 bytes of a valid PNG — used as a spoofed payload for the JPEG test.
const PNG_HEAD = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

function makeForm(file: { name: string; type: string; bytes: Buffer }): FormData {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(file.bytes)], { type: file.type }),
    file.name,
  )
  return form
}

async function postUpload(form: FormData) {
  return POST(
    new Request('http://localhost/api/upload', { method: 'POST', body: form }),
  )
}

describe('POST /api/upload — auth gate', () => {
  it('unauthenticated → 401', async () => {
    mockSession(null)
    const res = await postUpload(makeForm({ name: 'x.png', type: 'image/png', bytes: PNG_HEAD }))
    expect(res.status).toBe(401)
  })

  it('STUDENT cookie → 401 (ADMIN-only route)', async () => {
    const student = await createStudent()
    mockSession({ id: student.id, role: 'STUDENT', email: student.email })
    const res = await postUpload(makeForm({ name: 'x.png', type: 'image/png', bytes: PNG_HEAD }))
    expect(res.status).toBe(401)
  })

  it('TEACHER cookie → 401 (ADMIN-only route)', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER', email: teacher.email })
    const res = await postUpload(makeForm({ name: 'x.png', type: 'image/png', bytes: PNG_HEAD }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/upload — MIME guard wiring', () => {
  it('ADMIN spoofed JPEG (PNG magic bytes, image/jpeg declared) → 415', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await postUpload(
      makeForm({ name: 'x.jpg', type: 'image/jpeg', bytes: PNG_HEAD }),
    )
    expect(res.status).toBe(415)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain('does not match declared type')
  })

  it('ADMIN unsupported MIME (text/plain) → 415', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await postUpload(
      makeForm({ name: 'hi.txt', type: 'text/plain', bytes: Buffer.from('hi') }),
    )
    expect(res.status).toBe(415)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain('Unsupported type')
  })
})

describe('POST /api/upload — watermark on the returned url', () => {
  it('ADMIN genuine PNG → 200 with the overlay spliced into the url, public id untouched', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await postUpload(
      makeForm({ name: 'cover.png', type: 'image/png', bytes: PNG_HEAD }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url?: string; publicId?: string }
    expect(body.url).toBe(withWatermark(SECURE_URL))
    expect(hasWatermark(body.url ?? '')).toBe(true)
    expect(body.publicId).toBe('articles/covers/fake')
  })
})
