import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MaterialType } from '@prisma/client'
import { GET } from '@/app/api/download/[materialId]/route'
import { db } from '@/lib/db'
import { mockSession } from '../setup'
import { zagrebDateKey } from '@/lib/attendance-window'
import {
  classroomAccount,
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

describe('GET /api/download/[materialId] — TEACHER on a zamjena', () => {
  // Access through a per-termin change only: no TeacherAssignment anywhere, so
  // canManageMaterial refuses and the read-only fallback has to carry it.
  async function substituteOn(groupId: string, daysFromToday: number) {
    const teacher = await createTeacher()
    const today = zagrebDateKey(new Date())
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + daysFromToday)
    await db.sessionStaffChange.create({
      data: {
        scheduledGroupId: groupId,
        sessionDate: date,
        userId: teacher.id,
        role: 'LEAD',
        createdById: seeded.admin.id,
      },
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })
    return teacher
  }

  it('an upcoming zamjena on groupA → groupA material → 200', async () => {
    await substituteOn(seeded.groupAId, 3)
    expect((await callDownload(seeded.materialGroupA)).status).toBe(200)
  })

  it('an upcoming zamjena on groupA → groupB material → 404', async () => {
    await substituteOn(seeded.groupAId, 3)
    expect((await callDownload(seeded.materialGroupB)).status).toBe(404)
  })

  it('a zamjena whose termin has passed → groupA material → 404', async () => {
    await substituteOn(seeded.groupAId, -1)
    expect((await callDownload(seeded.materialGroupA)).status).toBe(404)
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

// The shared classroom login has no enrollments: it may pull what is visible in
// ANY current-year group of its city, under the same effective-visibility rule
// as a child — so a per-group hide still blocks it.
describe('GET /api/download/[materialId] — CLASSROOM', () => {
  it('Split classroom → groupA material (current year, SPLIT) → 200', async () => {
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
  })

  it('Split classroom → groupB material → 200 (every group of the city, not one)', async () => {
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    const res = await callDownload(seeded.materialGroupB)
    expect(res.status).toBe(200)
  })

  it('Split classroom → MODULE material hidden in A but visible in B → 200; hidden everywhere → 404', async () => {
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await callDownload(seeded.materialModule)).status).toBe(200)

    await db.materialGroupHide.create({
      data: { materialId: seeded.materialModule, scheduledGroupId: seeded.groupBId },
    })
    try {
      expect((await callDownload(seeded.materialModule)).status).toBe(404)
    } finally {
      await db.materialGroupHide.deleteMany({
        where: { materialId: seeded.materialModule, scheduledGroupId: seeded.groupBId },
      })
    }
  })

  it('Šibenik classroom → Split material → 404', async () => {
    const row = await classroomAccount('SIBENIK')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SIBENIK' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })

  it('classroom session without a city claim → 404, never every city', async () => {
    // `city: null` mocks the legacy-token case the session callback documents;
    // `city: undefined` in a Prisma where is "no filter", so this must fail closed.
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: null })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })
})
