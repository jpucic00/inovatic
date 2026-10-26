/**
 * Materijali v2 (4/4, Flux qsb7uru): "Samo za moj grad".
 *
 * Curriculum is shared by both cities; an admin may limit one material to their
 * OWN city with a stated reason (`Material.city` + `cityOnlyReason`). The rules
 * under test:
 *   - setMaterialCityOnly / makeMaterialShared: only curriculum of a SHARED
 *     program, only by the owning city once limited, reason required;
 *   - the DB backs the shape (Material_city_only_check);
 *   - a city-only row never reaches the other city's groups — portal, staff
 *     view, the staff Materijali tab, nor the download route (incl. the
 *     program-level `canManageMaterial` shortcut for teachers);
 *   - the other city's admin sees the row read-only: every mutation refuses it,
 *     and the program page marks it `otherCityOnly` / `canEdit: false`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MaterialType, type City } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { buildGroupMaterialsView, type GroupMaterialsView } from '@/lib/group-materials-view'
import { GET } from '@/app/api/download/[materialId]/route'
import { mockChildSession, mockSession } from './setup'
import {
  classroomAccount,
  createAdmin,
  createEnrollment,
  createLesson,
  createMaterial as seedMaterial,
  createModule,
  createModuleSchedule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND')
    ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
    throw err
  }),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
}))

const { setMaterialCityOnly, makeMaterialShared } = await import('@/actions/admin/material-city')
const { updateMaterial, deleteMaterial } = await import('@/actions/material/crud')
const { setMaterialsAudience, moveMaterialToLesson } = await import('@/actions/material/move')
const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')
const { getStaffGroupLessons } = await import('@/actions/teacher/materials')
const { getProgramDetail, getLessonEditorContext } = await import('@/actions/admin/program-materials')

const fx = fixtureScope()

// The download route streams the file from Cloudinary; intercept that fetch.
let upstreamSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  upstreamSpy = vi.spyOn(global, 'fetch').mockImplementation(
    async () => new Response('mock', { status: 200, headers: { 'content-length': '4' } }),
  )
})
afterEach(() => {
  upstreamSpy.mockClear()
})
afterAll(async () => {
  upstreamSpy.mockRestore()
  await fx.cleanup()
})

const SPLIT_ONLY_MSG = 'Ovaj materijal vrijedi samo za Split — mijenja ga taj grad.'
const REASON = 'Samo splitska dvorana ima ovaj set.'

/** Most recent Monday on/before `weeks*7` days ago (negative weeks = future). */
function mondayWeeksAgo(weeks: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - weeks * 7)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function lessonMaterialTitles(view: GroupMaterialsView): string[] {
  return view.modules.flatMap((s) => s.lessons.flatMap((l) => l.materials.map((m) => m.title)))
}

function moduleTeacherTitles(view: GroupMaterialsView): string[] {
  return view.modules.flatMap((s) => s.teacherMaterials.map((m) => m.title))
}

async function callDownload(materialId: string) {
  const req = new Request(`http://localhost/api/download/${materialId}`)
  return GET(req, { params: Promise.resolve({ materialId }) })
}

let splitAdminId = ''
let sibAdminId = ''

function asAdmin(city: City) {
  mockSession({ id: city === 'SPLIT' ? splitAdminId : sibAdminId, role: 'ADMIN', city })
}

beforeAll(async () => {
  splitAdminId = (await createAdmin({ city: 'SPLIT' })).id
  sibAdminId = (await createAdmin({ city: 'SIBENIK' })).id
})

/**
 * A shared standard program with one module in progress in BOTH cities, two
 * lessons in it, and one Monday group per city.
 */
async function seedSharedProgram() {
  const schoolYear = computeSchoolYear()
  const course = await fx.course({ kind: 'STANDARD' })
  const mod = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
  for (const city of ['SPLIT', 'SIBENIK'] as const) {
    await createModuleSchedule(mod.id, {
      schoolYear,
      city,
      startDate: mondayWeeksAgo(3),
      endDate: mondayWeeksAgo(-4),
    })
  }
  const lesson = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'Sat 1', sessionNumbers: [1] })
  // On sat 7, still ahead: "Sat 1" — where the rows sit — stays the current
  // lesson, so a parent's current-lesson-only view still lists them.
  const lesson2 = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'Sat 2', sessionNumbers: [7] })
  const splitGroup = await fx.group({ courseId: course.id, city: 'SPLIT', dayOfWeek: 'Ponedjeljak' })
  const sibGroup = await fx.group({ courseId: course.id, city: 'SIBENIK', dayOfWeek: 'Ponedjeljak' })
  return { course, mod, lesson, lesson2, splitGroup, sibGroup }
}

type Program = Awaited<ReturnType<typeof seedSharedProgram>>

/** A shared STUDENT lesson row with a downloadable file. */
function lessonRow(p: Program, o: Partial<Parameters<typeof seedMaterial>[0]> = {}) {
  return seedMaterial({
    scope: 'LESSON',
    lessonId: p.lesson.id,
    audience: 'STUDENT',
    type: MaterialType.DOCUMENT,
    fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/city-only.pdf',
    externalUrl: null,
    uploadedById: splitAdminId,
    ...o,
  })
}

async function materialCity(id: string) {
  return db.material.findUniqueOrThrow({ where: { id }, select: { city: true, cityOnlyReason: true } })
}

// ─── setMaterialCityOnly ─────────────────────────────────────────────────────

describe('setMaterialCityOnly', () => {
  it('the Split admin limits a shared lesson material to Split, reason stored trimmed', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p)
    asAdmin('SPLIT')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: `  ${REASON}  ` })

    expect(res).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: 'SPLIT', cityOnlyReason: REASON })
  })

  it('refuses a reason shorter than 5 characters (after trimming)', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p)
    asAdmin('SPLIT')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: '  abc   ' })

    expect(res).toEqual({ success: false, error: 'Napišite zašto materijal ne vrijedi za drugi grad.' })
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })

  it("refuses a group's own material", async () => {
    const p = await seedSharedProgram()
    const m = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: p.splitGroup.id,
      lessonId: p.lesson.id,
      uploadedById: splitAdminId,
    })
    asAdmin('SPLIT')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: REASON })

    expect(res).toEqual({ success: false, error: 'Materijal grupe već vrijedi samo za tu grupu.' })
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })

  it("refuses a radionica's material — the program already belongs to one city", async () => {
    const course = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const lesson = await createLesson({ courseId: course.id })
    const lessonMat = await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, uploadedById: splitAdminId })
    const courseMat = await seedMaterial({ scope: 'COURSE', courseId: course.id, uploadedById: splitAdminId })
    asAdmin('SPLIT')

    for (const m of [lessonMat, courseMat]) {
      const res = await setMaterialCityOnly({ materialId: m.id, reason: REASON })
      expect(res, m.scope).toEqual({ success: false, error: 'Radionica već pripada jednom gradu.' })
      expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
    }
  })

  it("answers another city's radionica material like a missing id", async () => {
    const course = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const lesson = await createLesson({ courseId: course.id })
    const m = await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, uploadedById: splitAdminId })
    asAdmin('SIBENIK')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: REASON })

    expect(res).toEqual({ success: false, error: 'Materijal nije pronađen.' })
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })

  it('the Šibenik admin can neither re-limit a Split-only row nor take it over', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { city: 'SPLIT', cityOnlyReason: REASON })
    asAdmin('SIBENIK')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: 'Šibenik ga želi za sebe.' })

    expect(res).toEqual({ success: false, error: SPLIT_ONLY_MSG })
    expect(await materialCity(m.id)).toEqual({ city: 'SPLIT', cityOnlyReason: REASON })
  })

  it('the owning city may restate its reason', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { city: 'SPLIT', cityOnlyReason: REASON })
    asAdmin('SPLIT')

    const res = await setMaterialCityOnly({ materialId: m.id, reason: 'Novi razlog za Split.' })

    expect(res).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: 'SPLIT', cityOnlyReason: 'Novi razlog za Split.' })
  })

  it('a teacher-only whole-module row can be limited', async () => {
    const p = await seedSharedProgram()
    const m = await seedMaterial({ scope: 'MODULE', moduleId: p.mod.id, uploadedById: splitAdminId })
    asAdmin('SIBENIK')

    expect(await setMaterialCityOnly({ materialId: m.id, reason: REASON })).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: 'SIBENIK', cityOnlyReason: REASON })
  })

  it('a teacher-only whole-program row can be limited', async () => {
    const p = await seedSharedProgram()
    const m = await seedMaterial({ scope: 'COURSE', courseId: p.course.id, uploadedById: splitAdminId })
    asAdmin('SIBENIK')

    expect(await setMaterialCityOnly({ materialId: m.id, reason: REASON })).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: 'SIBENIK', cityOnlyReason: REASON })
  })

  it('a missing material reads as not found', async () => {
    asAdmin('SPLIT')
    expect(await setMaterialCityOnly({ materialId: 'nope', reason: REASON })).toEqual({
      success: false,
      error: 'Materijal nije pronađen.',
    })
  })

  it('a teacher session is refused by the admin guard', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p)
    const teacher = await createTeacher()
    await createTeacherAssignment(teacher.id, p.splitGroup.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    await expect(setMaterialCityOnly({ materialId: m.id, reason: REASON })).rejects.toThrow(/NEXT_REDIRECT/)
    await expect(makeMaterialShared({ materialId: m.id })).rejects.toThrow(/NEXT_REDIRECT/)
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })
})

// ─── makeMaterialShared ──────────────────────────────────────────────────────

describe('makeMaterialShared', () => {
  it('the owning city returns the row to both cities, clearing the reason', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { city: 'SPLIT', cityOnlyReason: REASON })
    asAdmin('SPLIT')

    expect(await makeMaterialShared({ materialId: m.id })).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })

  it('the other city is refused', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { city: 'SPLIT', cityOnlyReason: REASON })
    asAdmin('SIBENIK')

    expect(await makeMaterialShared({ materialId: m.id })).toEqual({ success: false, error: SPLIT_ONLY_MSG })
    expect(await materialCity(m.id)).toEqual({ city: 'SPLIT', cityOnlyReason: REASON })
  })

  it('an already shared row is a successful no-op', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p)
    asAdmin('SIBENIK')

    expect(await makeMaterialShared({ materialId: m.id })).toEqual({ success: true })
    expect(await materialCity(m.id)).toEqual({ city: null, cityOnlyReason: null })
  })
})

// ─── Material_city_only_check ────────────────────────────────────────────────

describe('database constraint Material_city_only_check', () => {
  const base = { type: MaterialType.LINK, externalUrl: 'https://example.com', audience: 'STUDENT' as const }

  it('refuses a city without a reason', async () => {
    const p = await seedSharedProgram()
    await expect(
      db.material.create({
        data: { ...base, scope: 'LESSON', lessonId: p.lesson.id, title: 'Bez razloga', city: 'SPLIT', uploadedById: splitAdminId },
      }),
    ).rejects.toThrow(/Material_city_only_check/)
  })

  it('refuses a reason without a city', async () => {
    const p = await seedSharedProgram()
    await expect(
      db.material.create({
        data: { ...base, scope: 'LESSON', lessonId: p.lesson.id, title: 'Bez grada', cityOnlyReason: REASON, uploadedById: splitAdminId },
      }),
    ).rejects.toThrow(/Material_city_only_check/)
  })

  it('refuses a city on a GROUP row', async () => {
    const p = await seedSharedProgram()
    await expect(
      db.material.create({
        data: {
          ...base,
          scope: 'GROUP',
          scheduledGroupId: p.splitGroup.id,
          lessonId: p.lesson.id,
          title: 'Grupa s gradom',
          city: 'SPLIT',
          cityOnlyReason: REASON,
          uploadedById: splitAdminId,
        },
      }),
    ).rejects.toThrow(/Material_city_only_check/)
  })
})

// ─── Visibility ──────────────────────────────────────────────────────────────

describe('a Split-only material never reaches a Šibenik group', () => {
  async function seedVisibility() {
    const p = await seedSharedProgram()
    await lessonRow(p, { title: 'Zajedničko', fileUrl: null, type: MaterialType.LINK, externalUrl: 'https://example.com/a' })
    await lessonRow(p, { title: 'Samo Split', city: 'SPLIT', cityOnlyReason: REASON })
    await seedMaterial({ scope: 'LESSON', lessonId: p.lesson.id, audience: 'TEACHER', title: 'Samo Split za nastavnike', city: 'SPLIT', cityOnlyReason: REASON, uploadedById: splitAdminId })
    await seedMaterial({ scope: 'MODULE', moduleId: p.mod.id, title: 'Modul samo Split', city: 'SPLIT', cityOnlyReason: REASON, uploadedById: splitAdminId })
    await seedMaterial({ scope: 'COURSE', courseId: p.course.id, title: 'Program samo Split', city: 'SPLIT', cityOnlyReason: REASON, uploadedById: splitAdminId })
    return p
  }

  it('STUDENT view: in the Split group, not in the Šibenik group of the same lesson', async () => {
    const p = await seedVisibility()

    const split = await buildGroupMaterialsView(p.splitGroup.id, 'STUDENT')
    const sib = await buildGroupMaterialsView(p.sibGroup.id, 'STUDENT')

    expect(split.activeModuleId).toBe(p.mod.id)
    expect(sib.activeModuleId).toBe(p.mod.id)
    expect(lessonMaterialTitles(split).sort()).toEqual(['Samo Split', 'Zajedničko'])
    expect(lessonMaterialTitles(sib)).toEqual(['Zajedničko'])
  })

  it('the portal entry point agrees for a child in each city', async () => {
    const p = await seedVisibility()
    const splitChild = await createStudent({ city: 'SPLIT' })
    const sibChild = await createStudent({ city: 'SIBENIK' })
    await createEnrollment(splitChild.id, p.splitGroup.id)
    await createEnrollment(sibChild.id, p.sibGroup.id)

    mockChildSession(splitChild.id, 'SPLIT')
    expect(lessonMaterialTitles(await getEffectiveMaterialsForStudent(p.splitGroup.id))).toContain('Samo Split')

    mockChildSession(sibChild.id, 'SIBENIK')
    expect(lessonMaterialTitles(await getEffectiveMaterialsForStudent(p.sibGroup.id))).toEqual(['Zajedničko'])
  })

  it('STAFF view of the Šibenik group excludes every Split-only row', async () => {
    const p = await seedVisibility()

    const split = await buildGroupMaterialsView(p.splitGroup.id, 'STAFF')
    const sib = await buildGroupMaterialsView(p.sibGroup.id, 'STAFF')

    expect(lessonMaterialTitles(split).sort()).toEqual(['Samo Split', 'Samo Split za nastavnike', 'Zajedničko'])
    expect(moduleTeacherTitles(split)).toEqual(['Modul samo Split'])
    expect(split.programTeacherMaterials.map((m) => m.title)).toEqual(['Program samo Split'])

    expect(lessonMaterialTitles(sib)).toEqual(['Zajedničko'])
    expect(moduleTeacherTitles(sib)).toEqual([])
    expect(sib.programTeacherMaterials).toEqual([])
  })

  it("getStaffGroupLessons: the Šibenik group's Materijali tab excludes them, Split's lists them", async () => {
    const p = await seedVisibility()
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await createTeacherAssignment(sibTeacher.id, p.sibGroup.id)
    await createTeacherAssignment(splitTeacher.id, p.splitGroup.id)

    const titles = (r: Awaited<ReturnType<typeof getStaffGroupLessons>>) => [
      ...r.modules.flatMap((m) => [
        ...m.teacherRows,
        ...m.lessons.flatMap((l) => [...l.teacherRows, ...l.studentRows]),
      ]),
      ...r.programTeacherRows,
    ]

    mockSession({ id: sibTeacher.id, role: 'TEACHER', city: 'SIBENIK' })
    const sib = await getStaffGroupLessons(p.sibGroup.id)
    expect(titles(sib).map((r) => r.title)).toEqual(['Zajedničko'])

    mockSession({ id: splitTeacher.id, role: 'TEACHER', city: 'SPLIT' })
    const split = await getStaffGroupLessons(p.splitGroup.id)
    const splitRows = titles(split)
    expect(splitRows.map((r) => r.title).sort()).toEqual(
      ['Modul samo Split', 'Program samo Split', 'Samo Split', 'Samo Split za nastavnike', 'Zajedničko'].sort(),
    )
    expect(splitRows.find((r) => r.title === 'Samo Split')).toMatchObject({ city: 'SPLIT', cityOnlyReason: REASON })
  })
})

// ─── /api/download ───────────────────────────────────────────────────────────

describe('download of a Split-only lesson material', () => {
  let p: Program
  let splitOnlyId = ''
  let sharedId = ''

  beforeAll(async () => {
    p = await seedSharedProgram()
    splitOnlyId = (await lessonRow(p, { title: 'DL samo Split', city: 'SPLIT', cityOnlyReason: REASON })).id
    sharedId = (await lessonRow(p, { title: 'DL zajedničko' })).id
  })

  it('a Split parent gets it; a Šibenik parent 404s (but gets the shared one)', async () => {
    const splitChild = await createStudent({ city: 'SPLIT' })
    const sibChild = await createStudent({ city: 'SIBENIK' })
    await createEnrollment(splitChild.id, p.splitGroup.id)
    await createEnrollment(sibChild.id, p.sibGroup.id)

    mockChildSession(splitChild.id, 'SPLIT')
    expect((await callDownload(splitOnlyId)).status).toBe(200)

    mockChildSession(sibChild.id, 'SIBENIK')
    expect((await callDownload(splitOnlyId)).status).toBe(404)
    expect((await callDownload(sharedId)).status).toBe(200)
  })

  it('the Split classroom gets it; the Šibenik classroom 404s', async () => {
    const splitRoom = await classroomAccount('SPLIT')
    const sibRoom = await classroomAccount('SIBENIK')

    mockSession({ id: splitRoom.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await callDownload(splitOnlyId)).status).toBe(200)

    mockSession({ id: sibRoom.id, role: 'CLASSROOM', city: 'SIBENIK' })
    expect((await callDownload(splitOnlyId)).status).toBe(404)
    expect((await callDownload(sharedId)).status).toBe(200)
  })

  it("a Šibenik teacher on the same program 404s — canManageMaterial's program shortcut does not leak", async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    await createTeacherAssignment(sibTeacher.id, p.sibGroup.id)

    mockSession({ id: sibTeacher.id, role: 'TEACHER', city: 'SIBENIK' })
    expect((await callDownload(splitOnlyId)).status).toBe(404)
    expect((await callDownload(sharedId)).status).toBe(200)
  })

  it('a Split teacher on the program gets it', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await createTeacherAssignment(splitTeacher.id, p.splitGroup.id)

    mockSession({ id: splitTeacher.id, role: 'TEACHER', city: 'SPLIT' })
    expect((await callDownload(splitOnlyId)).status).toBe(200)
  })

  it('admins of BOTH cities get it — a shared program is either admin\'s curriculum', async () => {
    asAdmin('SPLIT')
    expect((await callDownload(splitOnlyId)).status).toBe(200)

    asAdmin('SIBENIK')
    expect((await callDownload(splitOnlyId)).status).toBe(200)
  })
})

describe("download of another city's radionica material", () => {
  it('reads as missing for the other admin, like the radionica program page', async () => {
    const radionica = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const lesson = await createLesson({ courseId: radionica.id, title: '1. lekcija' })
    const file = 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/radionica.pdf'
    const lessonFileId = (
      await seedMaterial({
        scope: 'LESSON',
        lessonId: lesson.id,
        audience: 'STUDENT',
        type: MaterialType.DOCUMENT,
        fileUrl: file,
        externalUrl: null,
        uploadedById: splitAdminId,
        title: 'Radionica lekcija',
      })
    ).id
    const programFileId = (
      await seedMaterial({
        scope: 'COURSE',
        courseId: radionica.id,
        audience: 'TEACHER',
        type: MaterialType.DOCUMENT,
        fileUrl: file,
        externalUrl: null,
        uploadedById: splitAdminId,
        title: 'Radionica priprema',
      })
    ).id

    asAdmin('SIBENIK')
    expect((await callDownload(lessonFileId)).status).toBe(404)
    expect((await callDownload(programFileId)).status).toBe(404)

    asAdmin('SPLIT')
    expect((await callDownload(lessonFileId)).status).toBe(200)
    expect((await callDownload(programFileId)).status).toBe(200)
  })
})

// ─── Mutations by the other city ─────────────────────────────────────────────

describe('the Šibenik admin cannot change a Split-only row; the Split admin can', () => {
  it('updateMaterial', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { title: 'Izvorni naslov', city: 'SPLIT', cityOnlyReason: REASON })

    asAdmin('SIBENIK')
    expect(await updateMaterial({ id: m.id, title: 'Šibenski naslov' })).toEqual({ success: false, error: SPLIT_ONLY_MSG })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).title).toBe('Izvorni naslov')

    asAdmin('SPLIT')
    expect(await updateMaterial({ id: m.id, title: 'Splitski naslov' })).toEqual({ success: true })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).title).toBe('Splitski naslov')
  })

  it('deleteMaterial', async () => {
    const p = await seedSharedProgram()
    // A link, so the delete schedules no Cloudinary cleanup.
    const m = await lessonRow(p, { type: MaterialType.LINK, fileUrl: null, externalUrl: 'https://example.com/d', city: 'SPLIT', cityOnlyReason: REASON })

    asAdmin('SIBENIK')
    expect(await deleteMaterial(m.id)).toEqual({ success: false, error: SPLIT_ONLY_MSG })
    expect(await db.material.count({ where: { id: m.id } })).toBe(1)

    asAdmin('SPLIT')
    expect(await deleteMaterial(m.id)).toEqual({ success: true })
    expect(await db.material.count({ where: { id: m.id } })).toBe(0)
  })

  it('setMaterialsAudience (refused with the city message)', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { title: 'Za premještanje', city: 'SPLIT', cityOnlyReason: REASON })

    asAdmin('SIBENIK')
    expect(await setMaterialsAudience({ materialIds: [m.id], audience: 'TEACHER' })).toEqual({
      success: false,
      error: 'Ovaj materijal vrijedi samo za Split — mijenja ga taj grad.',
    })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).audience).toBe('STUDENT')

    asAdmin('SPLIT')
    expect(await setMaterialsAudience({ materialIds: [m.id], audience: 'TEACHER' })).toEqual({ success: true })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).audience).toBe('TEACHER')
  })

  it('moveMaterialToLesson (refused with the city message)', async () => {
    const p = await seedSharedProgram()
    const m = await lessonRow(p, { city: 'SPLIT', cityOnlyReason: REASON })

    asAdmin('SIBENIK')
    expect(await moveMaterialToLesson({ materialId: m.id, lessonId: p.lesson2.id })).toEqual({
      success: false,
      error: 'Ovaj materijal vrijedi samo za Split — mijenja ga taj grad.',
    })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).lessonId).toBe(p.lesson.id)

    asAdmin('SPLIT')
    expect(await moveMaterialToLesson({ materialId: m.id, lessonId: p.lesson2.id })).toEqual({ success: true })
    expect((await db.material.findUniqueOrThrow({ where: { id: m.id } })).lessonId).toBe(p.lesson2.id)
  })
})

// ─── Program page ────────────────────────────────────────────────────────────

describe('program page shows the other city its Split-only rows read-only', () => {
  async function seedProgramPage() {
    const p = await seedSharedProgram()
    const lessonMat = await lessonRow(p, { title: 'Lekcija samo Split', city: 'SPLIT', cityOnlyReason: REASON })
    const moduleMat = await seedMaterial({ scope: 'MODULE', moduleId: p.mod.id, title: 'Modul samo Split', city: 'SPLIT', cityOnlyReason: REASON, uploadedById: splitAdminId })
    const courseMat = await seedMaterial({ scope: 'COURSE', courseId: p.course.id, title: 'Program zajednički', uploadedById: splitAdminId })
    return { p, lessonMat, moduleMat, courseMat }
  }

  it('getProgramDetail as the Šibenik admin', async () => {
    const { p, moduleMat, courseMat } = await seedProgramPage()
    asAdmin('SIBENIK')

    const detail = await getProgramDetail(p.course.id)

    expect(detail.viewerCity).toBe('SIBENIK')
    // Lesson + module row are Split-only; the program row is shared.
    expect(detail.cityOnlyCounts).toEqual([{ city: 'SPLIT', count: 2 }])
    const moduleRow = detail.lessonModules.flatMap((m) => m.teacherMaterials).find((r) => r.id === moduleMat.id)
    expect(moduleRow).toMatchObject({ city: 'SPLIT', cityOnlyReason: REASON, otherCityOnly: true, canEdit: false })
    expect(detail.programTeacherMaterials.find((r) => r.id === courseMat.id)).toMatchObject({
      city: null,
      otherCityOnly: false,
      canEdit: true,
    })
  })

  it('getProgramDetail as the Split admin: same rows, editable', async () => {
    const { p, moduleMat } = await seedProgramPage()
    asAdmin('SPLIT')

    const detail = await getProgramDetail(p.course.id)

    expect(detail.cityOnlyCounts).toEqual([{ city: 'SPLIT', count: 2 }])
    const moduleRow = detail.lessonModules.flatMap((m) => m.teacherMaterials).find((r) => r.id === moduleMat.id)
    expect(moduleRow).toMatchObject({ otherCityOnly: false, canEdit: true })
  })

  it('getLessonEditorContext marks the lesson row the same way', async () => {
    const { p, lessonMat } = await seedProgramPage()

    asAdmin('SIBENIK')
    const sib = await getLessonEditorContext(p.course.id, { lessonId: p.lesson.id })
    expect(sib.studentMaterials.find((r) => r.id === lessonMat.id)).toMatchObject({
      city: 'SPLIT',
      cityOnlyReason: REASON,
      otherCityOnly: true,
      canEdit: false,
    })

    asAdmin('SPLIT')
    const split = await getLessonEditorContext(p.course.id, { lessonId: p.lesson.id })
    expect(split.studentMaterials.find((r) => r.id === lessonMat.id)).toMatchObject({
      otherCityOnly: false,
      canEdit: true,
    })
  })
})
