/**
 * PR9 launch-gate isolation matrix — the residual cross-cutting sites.
 *
 * Per-site cross-city negatives landed with their feature PRs and live in:
 *   city-auth.test.ts            JWT city claim, legacy-token fail-close, city-guard asserts
 *   city-schema.test.ts          composite uniques + (locationId, city) FK backstop
 *   city-scoping-*.test.ts       admin lists/details/mutations per domain
 *   inquiry-city.test.ts         submitInquiry verification + party SPLIT stamping
 *   public-enrollment-window.ts  getActivePrograms city isolation under open windows
 *
 * This file closes the remaining matrix cells, each with explicit SIBENIK
 * actors (the SPLIT-everywhere test default would fail open):
 *   1. deleteTeacherComment — the teacher-panel delete path is tenant-bound
 *   2. gallery write paths — ADMIN pass-through is tenant-bound
 *   3. attendance reads/writes — ADMIN pass-through is tenant-bound
 *   4. material writes — GROUP is tenant-bound, MODULE/COURSE stay shared
 *   5. /api/download — GROUP city check, shared curriculum stays downloadable
 *   6. /api/group-availability — fail-closed ?city= param, per-city payload
 *   7. getActivePrograms — a single-city window never opens the other city
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MaterialType } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createEnrollmentWindow,
  createGroup,
  createMaterial,
  createModule,
  createModuleSchedule,
  createStudent,
  createTeacher,
  relativeDateKey,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

const { deleteTeacherComment } = await import('@/actions/teacher/student-comment')
const { addGalleryImages, removeGalleryImage } = await import('@/actions/gallery/crud')
const { getGroupAttendance, bulkMarkSession } = await import('@/actions/teacher/attendance')
const { createMaterial: createMaterialAction, deleteMaterial } = await import(
  '@/actions/material/crud'
)
const { GET: downloadGET } = await import('@/app/api/download/[materialId]/route')
const { GET: availabilityGET } = await import('@/app/api/group-availability/route')
const { getActivePrograms } = await import('@/actions/public/programs')

const YEAR = '2026/2027'
const createdCourseIds: string[] = []

// The download route streams the material's fileUrl — stub the upstream fetch.
let upstreamSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  upstreamSpy = vi.spyOn(global, 'fetch').mockImplementation(
    async () =>
      new Response('mock binary content', {
        status: 200,
        headers: { 'content-length': '19' },
      }),
  )
})

afterAll(async () => {
  upstreamSpy.mockRestore()
  // Material FKs are RESTRICT — clear them before their groups/modules/courses.
  await db.material.deleteMany({
    where: {
      OR: [
        { scheduledGroup: { courseId: { in: createdCourseIds } } },
        { module: { courseId: { in: createdCourseIds } } },
        { courseId: { in: createdCourseIds } },
      ],
    },
  })
  await db.courseEnrollmentWindow.deleteMany({ where: { courseId: { in: createdCourseIds } } })
  await db.moduleSchedule.deleteMany({ where: { module: { courseId: { in: createdCourseIds } } } })
  await db.scheduledGroup.deleteMany({ where: { courseId: { in: createdCourseIds } } })
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
})

// ─── 1. deleteTeacherComment — tenant-bound admin authority ─────────────────

describe('deleteTeacherComment — admin delete authority stops at the city line', () => {
  async function seedSplitComment() {
    const teacher = await createTeacher({ city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT', schoolYear: YEAR })
    await createEnrollment(student.id, group.id, { schoolYear: YEAR })
    const comment = await db.studentComment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        authorId: teacher.id,
        content: 'Odličan napredak.',
      },
    })
    return { teacher, comment }
  }

  it('a Šibenik admin deleting a Split comment reads it as nonexistent, row survives', async () => {
    const { comment } = await seedSplitComment()
    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const result = await deleteTeacherComment(comment.id)

    expect(result).toEqual({ success: false, error: 'Komentar nije pronađen.' })
    expect(
      await db.studentComment.findUnique({ where: { id: comment.id } }),
    ).not.toBeNull()
  })

  it('a same-city admin still deletes any comment; the author teacher still deletes their own', async () => {
    const first = await seedSplitComment()
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    expect(await deleteTeacherComment(first.comment.id)).toEqual({ success: true })

    const second = await seedSplitComment()
    mockSession({ id: second.teacher.id, role: 'TEACHER', city: 'SPLIT' })
    expect(await deleteTeacherComment(second.comment.id)).toEqual({ success: true })
    expect(
      await db.studentComment.findUnique({ where: { id: second.comment.id } }),
    ).toBeNull()
  })
})

// ─── 2. Gallery write paths — tenant-bound ADMIN pass-through ────────────────

describe('gallery writes — ADMIN pass-through is tenant-bound', () => {
  const imagePayload = (n: number) => ({
    url: `https://res.cloudinary.com/dgc2tp4f8/image/upload/v1/test/g${n}.jpg`,
    publicId: `test/gallery-${n}-${Date.now()}`,
  })

  async function seedRadionicaGroup(city: 'SPLIT' | 'SIBENIK') {
    // Radionica groups take moduleId: null — the simplest valid gallery shape.
    const course = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR })
    createdCourseIds.push(course.id)
    return createGroup({
      courseId: course.id,
      city,
      schoolYear: YEAR,
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
    })
  }

  it('addGalleryImages: a Šibenik admin cannot write into a Split group gallery', async () => {
    const splitGroup = await seedRadionicaGroup('SPLIT')
    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const result = await addGalleryImages({
      scheduledGroupId: splitGroup.id,
      moduleId: null,
      images: [imagePayload(1)],
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Nemate dopuštenje za ovu grupu.',
    })
    expect(
      await db.galleryImage.count({ where: { scheduledGroupId: splitGroup.id } }),
    ).toBe(0)
  })

  it('removeGalleryImage: a Šibenik admin cannot delete a Split image; same-city admin can', async () => {
    const splitGroup = await seedRadionicaGroup('SPLIT')
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })

    const added = await addGalleryImages({
      scheduledGroupId: splitGroup.id,
      moduleId: null,
      images: [imagePayload(2)],
    })
    expect(added.success).toBe(true)
    const imageId = added.images![0].id

    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    const denied = await removeGalleryImage(imageId)
    expect(denied).toEqual({ success: false, error: 'Nemate dopuštenje za ovu grupu.' })
    expect(await db.galleryImage.findUnique({ where: { id: imageId } })).not.toBeNull()

    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    expect(await removeGalleryImage(imageId)).toEqual({ success: true })
  })

  it('a Šibenik admin manages her own city gallery end-to-end', async () => {
    const sibGroup = await seedRadionicaGroup('SIBENIK')
    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const added = await addGalleryImages({
      scheduledGroupId: sibGroup.id,
      moduleId: null,
      images: [imagePayload(3)],
    })
    expect(added.success).toBe(true)
    expect(await removeGalleryImage(added.images![0].id)).toEqual({ success: true })
  })
})

// ─── 3. Attendance — tenant-bound ADMIN pass-through ─────────────────────────

describe('attendance — ADMIN pass-through is tenant-bound', () => {
  it('getGroupAttendance 404s a cross-city group for an ADMIN', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: YEAR })
    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(getGroupAttendance(splitGroup.id)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('bulkMarkSession 404s a cross-city group for an ADMIN and writes nothing', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: YEAR })
    const student = await createStudent({ city: 'SPLIT' })
    const enrollment = await createEnrollment(student.id, splitGroup.id, { schoolYear: YEAR })

    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(
      bulkMarkSession({
        groupId: splitGroup.id,
        sessionDate: '2026-07-13',
        entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
  })
})

// ─── 4. Material writes — GROUP tenant-bound, curriculum shared ──────────────

describe('material writes — GROUP is tenant-bound, MODULE curriculum stays shared', () => {
  it('createMaterial: a Šibenik admin cannot attach a GROUP material to a Split group', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: YEAR })
    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const result = await createMaterialAction({
      scope: 'GROUP',
      scheduledGroupId: splitGroup.id,
      title: 'Upute za grupu',
      type: 'LINK',
      externalUrl: 'https://example.com/upute',
      sortOrder: 0,
    })

    expect(result).toEqual({
      success: false,
      error: 'Nemate dopuštenje za dodavanje ovog materijala.',
    })
    expect(
      await db.material.count({ where: { scheduledGroupId: splitGroup.id } }),
    ).toBe(0)
  })

  it('deleteMaterial: a Šibenik admin cannot delete a Split GROUP material', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: YEAR })
    const material = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: splitGroup.id,
      uploadedById: splitAdmin.id,
    })

    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const result = await deleteMaterial(material.id)
    expect(result).toEqual({
      success: false,
      error: 'Nemate dopuštenje za brisanje ovog materijala.',
    })
    expect(await db.material.findUnique({ where: { id: material.id } })).not.toBeNull()
  })

  it('createMaterial: MODULE curriculum on a shared program is writable from either city', async () => {
    const course = await createCourse({ kind: 'STANDARD' })
    createdCourseIds.push(course.id)
    const moduleRow = await createModule(course.id)

    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    const result = await createMaterialAction({
      scope: 'MODULE',
      moduleId: moduleRow.id,
      title: 'Zajednički kurikulum',
      type: 'LINK',
      externalUrl: 'https://example.com/kurikulum',
      sortOrder: 0,
    })
    expect(result).toEqual({ success: true })
  })
})

// ─── 5. /api/download — GROUP city check, curriculum stays shared ────────────

describe('GET /api/download — GROUP downloads are tenant-bound, curriculum shared', () => {
  const fileUrl = 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/x.pdf'

  async function callDownload(materialId: string) {
    const req = new Request(`http://localhost/api/download/${materialId}`)
    return downloadGET(req, { params: Promise.resolve({ materialId }) })
  }

  it('an ADMIN 404s the other city GROUP material and 200s their own + shared curriculum', async () => {
    const uploader = await createAdmin({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'STANDARD' })
    createdCourseIds.push(course.id)
    const moduleRow = await createModule(course.id)

    const splitGroup = await createGroup({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
    const sibGroup = await createGroup({ courseId: course.id, city: 'SIBENIK', schoolYear: YEAR })

    const asDoc = {
      type: MaterialType.DOCUMENT,
      fileUrl,
      externalUrl: null,
      uploadedById: uploader.id,
    }
    const splitGroupMaterial = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: splitGroup.id,
      ...asDoc,
    })
    const sibGroupMaterial = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: sibGroup.id,
      ...asDoc,
    })
    const moduleMaterial = await createMaterial({
      scope: 'MODULE',
      moduleId: moduleRow.id,
      ...asDoc,
    })

    const sibAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    expect((await callDownload(splitGroupMaterial.id)).status).toBe(404)
    expect((await callDownload(sibGroupMaterial.id)).status).toBe(200)
    // MODULE/COURSE curriculum is deliberately shared across cities.
    expect((await callDownload(moduleMaterial.id)).status).toBe(200)

    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    expect((await callDownload(sibGroupMaterial.id)).status).toBe(404)
    expect((await callDownload(splitGroupMaterial.id)).status).toBe(200)
  })
})

// ─── 6. /api/group-availability — fail-closed city param ────────────────────

describe('GET /api/group-availability — fail-closed ?city= param, per-city payload', () => {
  const callAvailability = (query: string) =>
    availabilityGET(new Request(`http://localhost/api/group-availability${query}`))

  it('a missing or invalid city is a 400, never a silent empty result', async () => {
    expect((await callAvailability('')).status).toBe(400)
    expect((await callAvailability('?city=')).status).toBe(400)
    expect((await callAvailability('?city=ZAGREB')).status).toBe(400)
    expect((await callAvailability('?city=split')).status).toBe(400)
  })

  it('the payload for a city contains only that city groups', async () => {
    const course = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR })
    createdCourseIds.push(course.id)
    // Dated ahead of today: this asserts the city filter, so the radionica
    // start-date cutoff must not be what removes a group from the payload.
    const splitGroup = await createGroup({
      courseId: course.id, city: 'SPLIT', schoolYear: YEAR,
      dateStart: relativeDateKey(30), dateEnd: relativeDateKey(35),
    })
    const sibGroup = await createGroup({
      courseId: course.id, city: 'SIBENIK', schoolYear: YEAR,
      dateStart: relativeDateKey(30), dateEnd: relativeDateKey(35),
    })
    const openRange = {
      enrollmentStart: new Date('2026-01-01'),
      enrollmentEnd: new Date('2027-12-31'),
    }
    await createEnrollmentWindow(course.id, { schoolYear: YEAR, city: 'SPLIT', ...openRange })
    await createEnrollmentWindow(course.id, { schoolYear: YEAR, city: 'SIBENIK', ...openRange })

    const res = await callAvailability('?city=SIBENIK')
    expect(res.status).toBe(200)
    const programs = (await res.json()) as { groups: { id: string }[] }[]
    const groupIds = programs.flatMap((p) => p.groups.map((g) => g.id))

    expect(groupIds).toContain(sibGroup.id)
    expect(groupIds).not.toContain(splitGroup.id)
  })
})

// ─── 7. getActivePrograms — a single-city window never opens the other city ──

describe('getActivePrograms — a window in one city never opens the shared program in the other', () => {
  it('a SPLIT-only window on a shared standard program leaves Šibenik closed', async () => {
    // Shared standard program (city = null): one curriculum, per-city windows.
    const course = await createCourse({ kind: 'STANDARD' })
    createdCourseIds.push(course.id)
    const moduleRow = await createModule(course.id)
    // Only SPLIT has planned the year — its group needs an arc to render.
    await createModuleSchedule(moduleRow.id, {
      schoolYear: YEAR,
      city: 'SPLIT',
      startDate: new Date('2026-09-07'),
      endDate: new Date('2026-11-30'),
    })

    const splitGroup = await createGroup({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
    const sibGroup = await createGroup({ courseId: course.id, city: 'SIBENIK', schoolYear: YEAR })

    // The window exists ONLY for SPLIT.
    await createEnrollmentWindow(course.id, {
      schoolYear: YEAR,
      city: 'SPLIT',
      enrollmentStart: new Date('2026-01-01'),
      enrollmentEnd: new Date('2027-12-31'),
    })

    const splitPrograms = await getActivePrograms('SPLIT')
    const splitGroupIds = splitPrograms.flatMap((p) => p.groups.map((g) => g.id))
    expect(splitGroupIds).toContain(splitGroup.id)
    expect(splitGroupIds).not.toContain(sibGroup.id)

    // Šibenik has no window for this course+year → the program must not exist
    // there at all, even though the course itself is shared.
    const sibPrograms = await getActivePrograms('SIBENIK')
    expect(sibPrograms.some((p) => p.id === course.id)).toBe(false)
  })
})
