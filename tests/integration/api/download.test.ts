import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MaterialType } from '@prisma/client'
import { GET } from '@/app/api/download/[materialId]/route'
import { db } from '@/lib/db'
import { mockChildSession, mockSession } from '../setup'
import { zagrebDateKey } from '@/lib/attendance-window'
import {
  classroomAccount,
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createLesson,
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
  courseId: string
  groupAId: string
  groupBId: string
  materialGroupA: string
  materialLesson: string
  materialGroupB: string
  materialDiacritic: string
  /** Teacher-only (audience TEACHER) rows: a group's own and a program lesson's. */
  teacherGroupA: string
  teacherLesson: string
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
  // Materijali v2: every material a child can open sits in a lesson.
  const lesson = await createLesson({ courseId: course.id, moduleId: moduleRow.id, sessionNumbers: [1] })

  const groupA = await createGroup({ courseId: course.id })
  const groupB = await createGroup({ courseId: course.id })

  await createTeacherAssignment(tAssigned.id, groupA.id)
  await createEnrollment(sEnrolled.id, groupA.id, { schoolYear: groupA.schoolYear })

  const materialGroupA = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupA.id,
    lessonId: lesson.id,
    title: 'Grupa-A-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/a.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialLesson = await createMaterial({
    scope: 'LESSON',
    lessonId: lesson.id,
    audience: 'STUDENT',
    title: 'Lekcija-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/m.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialGroupB = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupB.id,
    lessonId: lesson.id,
    title: 'Grupa-B-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/b.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const materialDiacritic = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupA.id,
    lessonId: lesson.id,
    title: 'Čćžšđ-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/d.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })

  const teacherGroupA = await createMaterial({
    scope: 'GROUP',
    scheduledGroupId: groupA.id,
    lessonId: lesson.id,
    audience: 'TEACHER',
    title: 'Grupa-A-nastavnik-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/ta.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })
  const teacherLesson = await createMaterial({
    scope: 'LESSON',
    lessonId: lesson.id,
    audience: 'TEACHER',
    title: 'Lekcija-nastavnik-DL',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/tl.pdf',
    externalUrl: null,
    uploadedById: admin.id,
  })

  // Hide the program LESSON material in groupA so we can verify staff bypass it
  // while students don't.
  await db.materialGroupHide.create({
    data: { materialId: materialLesson.id, scheduledGroupId: groupA.id },
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
    courseId: course.id,
    groupAId: groupA.id,
    groupBId: groupB.id,
    materialGroupA: materialGroupA.id,
    materialLesson: materialLesson.id,
    materialGroupB: materialGroupB.id,
    materialDiacritic: materialDiacritic.id,
    teacherGroupA: teacherGroupA.id,
    teacherLesson: teacherLesson.id,
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

  it('ADMIN → LESSON material despite group hide → 200', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN' })
    const res = await callDownload(seeded.materialLesson)
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

  it('TEACHER assigned to groupA → LESSON material (hidden in A) → 200 (hide is staff-bypassed)', async () => {
    mockSession({ id: seeded.teacherAssigned.id, role: 'TEACHER' })
    const res = await callDownload(seeded.materialLesson)
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

  it('a zamjena dated today (Europe/Zagreb) → groupA material → 200 (the termin day still counts)', async () => {
    await substituteOn(seeded.groupAId, 0)
    expect((await callDownload(seeded.materialGroupA)).status).toBe(200)
  })

  it('an upcoming zamjena on groupA → LESSON material hidden in A → 404 (unlike the regular, the hide binds)', async () => {
    // Visible in groupB, which the substitute cannot open — so only A's hide decides.
    await substituteOn(seeded.groupAId, 3)
    expect((await callDownload(seeded.materialLesson)).status).toBe(404)
  })

  it('an upcoming zamjena on groupA → COURSE material of its program → 200', async () => {
    const material = await createMaterial({
      scope: 'COURSE',
      courseId: seeded.courseId,
      title: 'Program-DL',
      type: MaterialType.DOCUMENT,
      fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/c.pdf',
      externalUrl: null,
      uploadedById: seeded.admin.id,
    })
    await substituteOn(seeded.groupAId, 3)
    expect((await callDownload(material.id)).status).toBe(200)
  })
})

describe('GET /api/download/[materialId] — family session (picked child)', () => {
  it('child enrolled in groupA → groupA material → 200 + Content-Disposition', async () => {
    mockChildSession(seeded.studentEnrolled.id)
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename=/)
  })

  it('child enrolled in groupA → LESSON material (hidden in A) → 404 (hide blocks student)', async () => {
    mockChildSession(seeded.studentEnrolled.id)
    const res = await callDownload(seeded.materialLesson)
    expect(res.status).toBe(404)
  })

  it('child enrolled in groupA → groupB material → 404 (not enrolled in B)', async () => {
    mockChildSession(seeded.studentEnrolled.id)
    const res = await callDownload(seeded.materialGroupB)
    expect(res.status).toBe(404)
  })

  it('child with no enrollments → groupA material → 404', async () => {
    mockChildSession(seeded.studentNone.id)
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })
  it('a leftover STUDENT token (children no longer sign in) → 404', async () => {
    mockSession({ id: seeded.studentEnrolled.id, role: 'STUDENT' })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(404)
  })

  it('a teacher looking at their own child reads that child\'s group material', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER', studentId: seeded.studentEnrolled.id })
    const res = await callDownload(seeded.materialGroupA)
    expect(res.status).toBe(200)
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

  it('Split classroom → LESSON material hidden in A but visible in B → 200; hidden everywhere → 404', async () => {
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await callDownload(seeded.materialLesson)).status).toBe(200)

    await db.materialGroupHide.create({
      data: { materialId: seeded.materialLesson, scheduledGroupId: seeded.groupBId },
    })
    try {
      expect((await callDownload(seeded.materialLesson)).status).toBe(404)
    } finally {
      await db.materialGroupHide.deleteMany({
        where: { materialId: seeded.materialLesson, scheduledGroupId: seeded.groupBId },
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

// Materijali v2: a TEACHER-audience row is the staff room. The portal branches
// (a parent's picked child, the classroom login) run the STUDENT viewer and must
// 404 it even in their own group; staff run STAFF and may read it.
describe('GET /api/download/[materialId] — teacher-only (audience TEACHER) materials', () => {
  it('a parent whose child is in groupA → 404 for the TEACHER group and lesson rows, 200 for a STUDENT one', async () => {
    mockChildSession(seeded.studentEnrolled.id)
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(404)
    expect((await callDownload(seeded.teacherLesson)).status).toBe(404)
    expect((await callDownload(seeded.materialGroupA)).status).toBe(200)
  })

  it('the Split classroom → 404 for the TEACHER rows, 200 for a STUDENT one', async () => {
    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(404)
    expect((await callDownload(seeded.teacherLesson)).status).toBe(404)
    expect((await callDownload(seeded.materialGroupA)).status).toBe(200)
  })

  it('the teacher assigned to groupA reads both TEACHER rows', async () => {
    mockSession({ id: seeded.teacherAssigned.id, role: 'TEACHER' })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(200)
    expect((await callDownload(seeded.teacherLesson)).status).toBe(200)
  })

  it('a same-city admin reads both TEACHER rows', async () => {
    mockSession({ id: seeded.admin.id, role: 'ADMIN', city: 'SPLIT' })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(200)
    expect((await callDownload(seeded.teacherLesson)).status).toBe(200)
  })

  it('a staff member viewing their own child does not lose the staff read', async () => {
    mockSession({
      id: seeded.teacherAssigned.id,
      role: 'TEACHER',
      studentId: seeded.studentEnrolled.id,
    })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(200)
  })

  it('a teacher with no assignment → 404 for the TEACHER rows', async () => {
    mockSession({ id: seeded.teacherUnassigned.id, role: 'TEACHER' })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(404)
    expect((await callDownload(seeded.teacherLesson)).status).toBe(404)
  })

  it('an upcoming zamjena on groupA reads the TEACHER group row (prepares with it)', async () => {
    const teacher = await createTeacher()
    const today = zagrebDateKey(new Date())
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + 3)
    await db.sessionStaffChange.create({
      data: {
        scheduledGroupId: seeded.groupAId,
        sessionDate: date,
        userId: teacher.id,
        role: 'LEAD',
        createdById: seeded.admin.id,
      },
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })
    expect((await callDownload(seeded.teacherGroupA)).status).toBe(200)
  })
})
