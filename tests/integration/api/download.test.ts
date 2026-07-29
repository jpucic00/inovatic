import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MaterialType } from '@prisma/client'
import { GET } from '@/app/api/download/[materialId]/route'
import { db } from '@/lib/db'
import { mockSession } from '../setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createMaterial,
  createModule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// Mock the upstream Cloudinary fetch so tests don't hit the network on 200
// responses. The route's fetch() call is what we intercept.
let upstreamSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  upstreamSpy = vi.spyOn(global, 'fetch').mockImplementation(async () =>
    new Response('mock binary content', {
      status: 200,
      headers: { 'content-length': '20' },
    }),
  )
})
afterEach(() => {
  upstreamSpy.mockClear()
})
afterAll(() => {
  upstreamSpy.mockRestore()
})

async function callDownload(materialId: string) {
  const req = new Request(`http://localhost/api/download/${materialId}`)
  return GET(req, { params: Promise.resolve({ materialId }) })
}

// ─── Suite-wide fixtures ────────────────────────────────────────────────────
//
// Build the full access matrix once. Each test mocks the session for the
// role it exercises against the same shared materials. This mirrors the
// Playwright suite's beforeAll seeding pattern.

type Seeded = {
  admin: { id: string }
  teacherAssigned: { id: string }
  teacherUnassigned: { id: string }
  studentEnrolled: { id: string }
  studentNone: { id: string }
  groupAId: string
  groupBId: string
  materialGroupA: string
  materialModule: string
  materialGroupB: string
  materialDiacritic: string
}
let seeded: Seeded

beforeAll(async () => {
  const admin = await createAdmin()
  const tAssigned = await createTeacher()
  const tUnassigned = await createTeacher()
  const sEnrolled = await createStudent()
  const sNone = await createStudent()

  const course = await createCourse({ kind: 'STANDARD' })
  const moduleRow = await createModule(course.id)

  const groupA = await createGroup({ courseId: course.id })
  const groupB = await createGroup({ courseId: course.id })

  await createTeacherAssignment(tAssigned.id, groupA.id)
  await createEnrollment(sEnrolled.id, groupA.id, { schoolYear: groupA.schoolYear })

  const materialGroupA = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupA.id,
    title: 'Grupa-A-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/a.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialModule = await createMaterial({
    scope: 'MODULE',
    moduleId: moduleRow.id,
    title: 'Modul-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/m.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialGroupB = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupB.id,
    title: 'Grupa-B-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/b.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialDiacritic = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupA.id,
    title: 'Čćžšđ-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/d.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })

  // Hide MODULE-scoped material in groupA so we can verify staff bypass it
  // while students don't.
  await db.materialGroupHide.create({
    data: { materialId: materialModule.id, scheduledGroupId: groupA.id },
  })

  // Set mimeType so Content-Disposition extension logic kicks in.
  await db.material.update({
    where: { id: materialDiacritic.id },
    data: { mimeType: 'text/plain' },
  })

  seeded = {
    admin: { id: admin.id },
    teacherAssigned: { id: tAssigned.id },
    teacherUnassigned: { id: tUnassigned.id },
    studentEnrolled: { id: sEnrolled.id },
    studentNone: { id: sNone.id },
    groupAId: groupA.id,
    groupBId: groupB.id,
    materialGroupA: materialGroupA.id,
    materialModule: materialModule.id,
    materialGroupB: materialGroupB.id,
    materialDiacritic: materialDiacritic.id,
  }
})

describe('GET /api/download/[materialId] — unauth', () => {
  it('unauthenticated → 401 JSON', async () => {
    mockSession(null)
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('Unauthorized')
  })
})

describe('GET /api/download/[materialId] — ADMIN', () => {
  it('ADMIN → GROUP-scope material → 200 + Content-Disposition attachment', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename=/)
  })

  it('ADMIN → MODULE-scope material despite group hide → 200', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN' })
    const res = await callDownload(seeded.materialModule)
    expect(res.status).toBe(200)
  })

  it('ADMIN → non-existent materialId → 404', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN' })
    const res = await callDownload('cltest_doesnotexist_aaaa')
    expect(res.status).toBe(404)
  })

  it('ADMIN → diacritic-title material → Content-Disposition filename is sanitised', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN' })
    const res = await callDownload(seeded.materialDiacritic)
    expect(res.status).toBe(200)
    // NFD-strip removes Čćžš combining marks → Cczs; đ has no NFD
    // decomposition, replaced by `_`; trailing space collapses; ext from
    // text/plain → .txt. Pins src/lib/cloudinary-url.ts sanitiseFilename.
    expect(res.headers.get('content-disposition')).toMatch(/filename="Cczs_-DL\.txt"/)
  })
})

describe('GET /api/download/[materialId] — TEACHER', () => {
  it('TEACHER assigned to groupA → groupA material → 200', async () => {
    mockSession({ id: seeded.teacherAssigned.id, role: 'TEACHER' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
  })

  it('TEACHER assigned to groupA → MODULE material (hidden in A) → 200 (hide is staff-bypassed)', async () => {
    mockSession({ id: seeded.teacherAssigned.id, role: 'TEACHER' })
    const res = await callDownload(seeded.materialModule)
    expect(res.status).toBe(200)
  })

  it('TEACHER assigned to groupA → groupB material → 404 (no assignment to B)', async () => {
    mockSession({ id: seeded.teacherAssigned.id, role: 'TEACHER' })
    const res = await callDownload(seeded.materialGroupB)
    expect(res.status).toBe(404)
  })

  it('TEACHER with no assignments → groupA material → 404', async () => {
    mockSession({ id: seeded.teacherUnassigned.id, role: 'TEACHER' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/download/[materialId] — STUDENT', () => {
  it('STUDENT enrolled in groupA → groupA material → 200 + Content-Disposition', async () => {
    mockSession({ id: seeded.studentEnrolled.id, role: 'STUDENT' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename=/)
  })

  it('STUDENT enrolled in groupA → MODULE material (hidden in A) → 404 (hide blocks student)', async () => {
    mockSession({ id: seeded.studentEnrolled.id, role: 'STUDENT' })
    const res = await callDownload(seeded.materialModule)
    expect(res.status).toBe(404)
  })

  it('STUDENT enrolled in groupA → groupB material → 404 (not enrolled in B)', async () => {
    mockSession({ id: seeded.studentEnrolled.id, role: 'STUDENT' })
    const res = await callDownload(seeded.materialGroupB)
    expect(res.status).toBe(404)
  })

  it('STUDENT with no enrollments → groupA material → 404', async () => {
    mockSession({ id: seeded.studentNone.id, role: 'STUDENT' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })
})
