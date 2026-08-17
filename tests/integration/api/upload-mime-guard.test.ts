/**
 * MIME-guard coverage for the two scoped upload routes.
 *
 * `/api/upload` (the article/cover route) keeps its own guard cases in
 * upload.test.ts; the materials + gallery routes had role-rejection coverage
 * only after tests/phase3/33-mime-guard.spec.ts was deleted in the three-tier
 * migration (Flux yga89ap). SVG is the payload that matters: an <svg> served
 * from the Cloudinary delivery domain executes its inline <script> in the
 * viewer's browser, so both routes must refuse it — declared honestly AND
 * renamed to slip past the allow-list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Both routes stream to Cloudinary on the success path. Stub the client so the
// positive control below stays offline — without it the 415 assertions could
// pass on a route that rejects everything.
vi.mock('@/lib/cloudinary', () => {
  type UploadCallback = (
    err: undefined,
    res: {
      secure_url: string
      public_id: string
      bytes: number
      width: number
      height: number
    },
  ) => void
  return {
    default: {
      uploader: {
        upload_stream: (_opts: unknown, cb: UploadCallback) => ({
          end: (bytes: Buffer) =>
            cb(undefined, {
              secure_url: 'https://res.cloudinary.test/fake.png',
              public_id: 'fake',
              bytes: bytes.length,
              width: 1,
              height: 1,
            }),
        }),
      },
    },
  }
})

import { mockSession } from '../setup'
import { createAdmin, createTeacher } from '../helpers/factory'

const { POST: postMaterials } = await import('@/app/api/upload/materials/route')
const { POST: postGallery } = await import('@/app/api/upload/gallery/route')

// A real stored-XSS payload, and comfortably over the 12-byte floor
// `mimeMatchesBytes` needs before it inspects magic bytes — so the renamed-SVG
// case below is rejected by the signature check, not by the length guard.
const SVG_XSS = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>',
)
const PNG_HEAD = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

type UploadRoute = (req: Request) => Promise<Response>

function postFile(
  route: UploadRoute,
  path: string,
  file: { name: string; type: string; bytes: Buffer },
): Promise<Response> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(file.bytes)], { type: file.type }),
    file.name,
  )
  return route(new Request(`http://localhost${path}`, { method: 'POST', body: form }))
}

// Both routes admit ADMIN and TEACHER. Materials runs as ADMIN and gallery as
// TEACHER so the guard is proven to sit behind both roles, not just one.
const ROUTES = [
  {
    label: '/api/upload/materials',
    path: '/api/upload/materials',
    route: postMaterials as UploadRoute,
    signIn: async () => {
      const admin = await createAdmin()
      mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    },
  },
  {
    label: '/api/upload/gallery',
    path: '/api/upload/gallery',
    route: postGallery as UploadRoute,
    signIn: async () => {
      const teacher = await createTeacher()
      mockSession({ id: teacher.id, role: 'TEACHER', email: teacher.email })
    },
  },
] as const

describe.each(ROUTES)('POST $label — SVG rejection', ({ path, route, signIn }) => {
  beforeEach(async () => {
    await signIn()
  })

  it('declared image/svg+xml → 415 (allow-list gate)', async () => {
    const res = await postFile(route, path, {
      name: 'payload.svg',
      type: 'image/svg+xml',
      bytes: SVG_XSS,
    })
    expect(res.status).toBe(415)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain('Unsupported type')
  })

  it('SVG bytes renamed to image/png → 415 (magic-byte gate)', async () => {
    const res = await postFile(route, path, {
      name: 'payload.png',
      type: 'image/png',
      bytes: SVG_XSS,
    })
    expect(res.status).toBe(415)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain('does not match declared type')
  })

  it('genuine PNG → accepted (positive control)', async () => {
    const res = await postFile(route, path, {
      name: 'photo.png',
      type: 'image/png',
      bytes: PNG_HEAD,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url?: string }
    expect(body.url).toBe('https://res.cloudinary.test/fake.png')
  })
})
