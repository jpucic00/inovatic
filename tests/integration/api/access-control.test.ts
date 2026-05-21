import { describe, expect, it, vi } from 'vitest'
import { POST as UPLOAD_MATERIALS_POST } from '@/app/api/upload/materials/route'
import { POST as UPLOAD_GALLERY_POST } from '@/app/api/upload/gallery/route'
import { mockSession } from '../setup'
import {
  createAdmin,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// 10 of 15 tests migrated from tests/phase3/28-access-control.spec.ts.
// The 5 DOM-redirect-flow tests stay as Playwright.
// Coverage migrated:
//   - /api/upload/materials role rejection (unauth, STUDENT)
//   - /api/upload/gallery role rejection (unauth, STUDENT)
//   - requireAdmin / requireTeacher / requireStudent guards bounce wrong roles
//   - assertTeacherOwnsGroup throws 404 (notFound) for non-owners
//
// The requireXxx() guards call `redirect()` from next/navigation, which
// throws a `NEXT_REDIRECT` error. We catch and assert on the throw.

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

// Import after the mock so the guards pick up the mocked redirect/notFound.
const { requireAdmin, requireStudent, requireTeacher } = await import('@/lib/auth-guard')
const { assertTeacherOwnsGroup } = await import('@/lib/teacher-guard')

function makeUploadForm(file: { name: string; type: string; bytes: Buffer }): FormData {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(file.bytes)], { type: file.type }),
    file.name,
  )
  return form
}

describe('/api/upload/materials role rejection', () => {
  it('unauthenticated → 401', async () => {
    mockSession(null)
    const form = makeUploadForm({ name: 'x.txt', type: 'text/plain', bytes: Buffer.from('hi') })
    const res = await UPLOAD_MATERIALS_POST(
      new Request('http://localhost/api/upload/materials', { method: 'POST', body: form }),
    )
    expect(res.status).toBe(401)
  })

  it('STUDENT cookie → 401', async () => {
    const student = await createStudent()
    mockSession({ id: student.id, role: 'STUDENT', email: student.email })
    const form = makeUploadForm({ name: 'x.txt', type: 'text/plain', bytes: Buffer.from('hi') })
    const res = await UPLOAD_MATERIALS_POST(
      new Request('http://localhost/api/upload/materials', { method: 'POST', body: form }),
    )
    expect(res.status).toBe(401)
  })
})

describe('/api/upload/gallery role rejection', () => {
  it('unauthenticated → 401', async () => {
    mockSession(null)
    const form = makeUploadForm({ name: 'x.png', type: 'image/png', bytes: Buffer.from([137, 80]) })
    const res = await UPLOAD_GALLERY_POST(
      new Request('http://localhost/api/upload/gallery', { method: 'POST', body: form }),
    )
    expect(res.status).toBe(401)
  })

  it('STUDENT cookie → 401', async () => {
    const student = await createStudent()
    mockSession({ id: student.id, role: 'STUDENT', email: student.email })
    const form = makeUploadForm({ name: 'x.png', type: 'image/png', bytes: Buffer.from([137, 80]) })
    const res = await UPLOAD_GALLERY_POST(
      new Request('http://localhost/api/upload/gallery', { method: 'POST', body: form }),
    )
    expect(res.status).toBe(401)
  })
})

describe('Route guards bounce wrong roles to /prijava (via redirect throw)', () => {
  it('requireAdmin throws NEXT_REDIRECT when unauthenticated', async () => {
    mockSession(null)
    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireAdmin throws NEXT_REDIRECT when role=STUDENT', async () => {
    const s = await createStudent()
    mockSession({ id: s.id, role: 'STUDENT' })
    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireAdmin throws NEXT_REDIRECT when role=TEACHER', async () => {
    const t = await createTeacher()
    mockSession({ id: t.id, role: 'TEACHER' })
    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireStudent throws NEXT_REDIRECT when role=ADMIN', async () => {
    const a = await createAdmin()
    mockSession({ id: a.id, role: 'ADMIN' })
    await expect(requireStudent()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireStudent throws NEXT_REDIRECT when role=TEACHER', async () => {
    const t = await createTeacher()
    mockSession({ id: t.id, role: 'TEACHER' })
    await expect(requireStudent()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireTeacher throws NEXT_REDIRECT when role=STUDENT', async () => {
    const s = await createStudent()
    mockSession({ id: s.id, role: 'STUDENT' })
    await expect(requireTeacher()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('requireTeacher allows ADMIN passthrough (per Phase 3 conventions)', async () => {
    const a = await createAdmin()
    mockSession({ id: a.id, role: 'ADMIN' })
    const session = await requireTeacher()
    expect(session.user.role).toBe('ADMIN')
  })
})

describe('Teacher-owns-group guard', () => {
  it('throws NEXT_NOT_FOUND when teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(assertTeacherOwnsGroup(group.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('passes when teacher IS assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(assertTeacherOwnsGroup(group.id)).resolves.not.toThrow()
  })

  it('ADMIN bypasses the assignment check', async () => {
    const admin = await createAdmin()
    const group = await createGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await expect(assertTeacherOwnsGroup(group.id)).resolves.not.toThrow()
  })
})
