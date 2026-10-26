/**
 * Materijali v2 — the admin lesson actions and the material move actions.
 *
 *   - createLesson / updateLesson / deleteLesson (src/actions/admin/lessons.ts):
 *     placement rules per program kind, one lesson per (module, sat) named in
 *     the refusal, the staged materials written in the SAME transaction, and a
 *     radionica of another city read as missing;
 *   - setMaterialsAudience / moveMaterialToLesson (src/actions/material/move.ts):
 *     all-or-nothing batches, the teacher-only MODULE/COURSE rows and RoboCamp
 *     guides refused, and the admin/teacher permission split;
 *   - createMaterial: an admin may not write into another city's radionica
 *     lesson, while the shared programs (city null) stay every admin's.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createLesson as seedLesson,
  createMaterial as seedMaterial,
  createModule,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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

const { createLesson, updateLesson, deleteLesson } = await import('@/actions/admin/lessons')
const { setMaterialsAudience, moveMaterialToLesson } = await import('@/actions/material/move')
const { createMaterial } = await import('@/actions/material/crud')

const fx = fixtureScope()

afterAll(async () => {
  await fx.cleanup()
})

const linkFields = {
  type: 'LINK' as const,
  fileUrl: null,
  externalUrl: 'https://example.com/x',
  description: null,
  fileSize: null,
  mimeType: null,
  sortOrder: 0,
}

async function splitAdmin() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  return admin
}

async function sibenikAdmin() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

/** A shared standard program with two modules, by sortOrder. */
async function standardProgram() {
  const course = await fx.course({ kind: 'STANDARD' })
  const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
  const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
  return { course, m1, m2 }
}

async function sessionsOf(lessonId: string): Promise<number[]> {
  const rows = await db.lessonSession.findMany({
    where: { lessonId },
    select: { sessionNumber: true },
    orderBy: { sessionNumber: 'asc' },
  })
  return rows.map((r) => r.sessionNumber)
}

// ─── createLesson ────────────────────────────────────────────────────────────

describe('createLesson', () => {
  it('creates a standard lesson on sats 1–2 with its staged materials in one go', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()

    const res = await createLesson({
      courseId: course.id,
      moduleId: m1.id,
      title: 'Puž',
      sessionNumbers: [1, 2],
      materials: [
        {
          audience: 'STUDENT',
          title: 'Upute za djecu',
          type: 'LINK',
          externalUrl: 'https://example.com/upute',
        },
        {
          audience: 'TEACHER',
          title: 'Priprema za nastavnike',
          type: 'DOCUMENT',
          fileUrl: 'https://res.cloudinary.com/demo/raw/upload/priprema.pdf',
        },
      ],
    })

    expect(res.success).toBe(true)
    if (!res.success) return
    const lesson = await db.lesson.findUniqueOrThrow({ where: { id: res.lessonId } })
    expect(lesson).toMatchObject({ courseId: course.id, moduleId: m1.id, title: 'Puž' })
    expect(await sessionsOf(res.lessonId)).toEqual([1, 2])

    const materials = await db.material.findMany({
      where: { lessonId: res.lessonId },
      orderBy: { sortOrder: 'asc' },
    })
    expect(materials.map((m) => [m.title, m.scope, m.audience, m.type])).toEqual([
      ['Upute za djecu', 'LESSON', 'STUDENT', 'LINK'],
      ['Priprema za nastavnike', 'LESSON', 'TEACHER', 'DOCUMENT'],
    ])
    expect(materials.every((m) => m.uploadedById === admin.id)).toBe(true)
    expect(materials.every((m) => m.scheduledGroupId === null && m.moduleId === null && m.courseId === null)).toBe(
      true,
    )
  })

  it('refuses a sat another lesson holds, naming it, and writes nothing', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()
    await seedLesson({ courseId: course.id, moduleId: m1.id, title: 'Vrtuljak', sessionNumbers: [2] })

    const res = await createLesson({
      courseId: course.id,
      moduleId: m1.id,
      title: 'Uljez',
      sessionNumbers: [1, 2],
      materials: [{ audience: 'STUDENT', title: 'Uljezov materijal', type: 'LINK', externalUrl: 'https://example.com/u' }],
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('2. sat')
      expect(res.error).toContain('Vrtuljak')
    }
    expect(await db.lesson.count({ where: { courseId: course.id, title: 'Uljez' } })).toBe(0)
    expect(await db.material.count({ where: { title: 'Uljezov materijal' } })).toBe(0)
    expect(await db.lessonSession.count({ where: { moduleId: m1.id, sessionNumber: 1 } })).toBe(0)
  })

  it('refuses the probni sat (0) on a module that is not the first', async () => {
    await splitAdmin()
    const { course, m2 } = await standardProgram()

    const res = await createLesson({ courseId: course.id, moduleId: m2.id, title: 'Probni u M2', sessionNumbers: [0] })

    expect(res).toEqual({ success: false, error: 'Probni sat postoji samo prije prvog modula.' })
    expect(await db.lesson.count({ where: { courseId: course.id } })).toBe(0)
  })

  it('accepts the probni sat (0) on the first module', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()

    const res = await createLesson({ courseId: course.id, moduleId: m1.id, title: 'Probni sat', sessionNumbers: [0] })

    expect(res.success).toBe(true)
    if (res.success) expect(await sessionsOf(res.lessonId)).toEqual([0])
  })

  it('a radionica lesson sits under the program without sats', async () => {
    await splitAdmin()
    const course = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })

    const ok = await createLesson({ courseId: course.id, moduleId: null, title: 'Radionica dan 1', sessionNumbers: [] })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(await db.lesson.findUniqueOrThrow({ where: { id: ok.lessonId } })).toMatchObject({ moduleId: null })
    }

    // With no module there is nothing a sat could belong to.
    const dated = await createLesson({ courseId: course.id, moduleId: null, title: 'Datirana', sessionNumbers: [1] })
    expect(dated.success).toBe(false)
    expect(await db.lesson.count({ where: { courseId: course.id, title: 'Datirana' } })).toBe(0)
  })

  it('places a competition lesson on weekly season sats (1–52), never the probni sat', async () => {
    await splitAdmin()
    const course = await fx.course({ kind: 'COMPETITION' })
    const mod = await createModule(course.id)

    const res = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'FLL sat', sessionNumbers: [12, 13] })
    expect(res.success).toBe(true)
    const sessions = await db.lessonSession.findMany({ where: { moduleId: mod.id }, orderBy: { sessionNumber: 'asc' } })
    expect(sessions.map((x) => x.sessionNumber)).toEqual([12, 13])

    const probni = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'Probni', sessionNumbers: [0] })
    expect(probni).toEqual({ success: false, error: 'Sat natjecanja mora biti između 1 i 52.' })

    // Undated stays fine — existing natjecanje lessons have no sats.
    const undated = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'FLL', sessionNumbers: [] })
    expect(undated.success).toBe(true)
  })

  it('keeps a standard lesson inside the module\'s 7 sats', async () => {
    await splitAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)

    const res = await createLesson({ courseId: course.id, moduleId: mod.id, title: 'Osmi', sessionNumbers: [8] })
    expect(res).toEqual({ success: false, error: 'Modul ima 7 sati.' })
  })

  it("refuses a module of another program", async () => {
    await splitAdmin()
    const { course } = await standardProgram()
    const other = await standardProgram()

    const res = await createLesson({ courseId: course.id, moduleId: other.m1.id, title: 'Krivi modul', sessionNumbers: [1] })

    expect(res).toEqual({ success: false, error: 'Modul ne pripada ovom programu.' })
    expect(await db.lesson.count({ where: { title: 'Krivi modul' } })).toBe(0)
  })

  it('refuses a staged RoboCamp guide meant for the teachers', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()

    const res = await createLesson({
      courseId: course.id,
      moduleId: m1.id,
      title: 'S vodičem',
      sessionNumbers: [3],
      materials: [
        {
          audience: 'TEACHER',
          title: 'Vodič za nastavnike',
          type: 'ROBOCAMP',
          externalUrl: 'https://elearning.robocamp.eu/course/1',
        },
      ],
    })

    expect(res).toEqual({ success: false, error: 'RoboCamp vodič je materijal za polaznike.' })
    expect(await db.lesson.count({ where: { courseId: course.id } })).toBe(0)
  })

  it("a Šibenik admin cannot create a lesson in a Split radionica", async () => {
    await sibenikAdmin()
    const course = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })

    const res = await createLesson({ courseId: course.id, moduleId: null, title: 'Tuđa radionica', sessionNumbers: [] })

    expect(res).toEqual({ success: false, error: 'Program nije pronađen.' })
    expect(await db.lesson.count({ where: { courseId: course.id } })).toBe(0)
  })

  it('a Šibenik admin may create a lesson in a shared standard program', async () => {
    await sibenikAdmin()
    const { course, m1 } = await standardProgram()

    const res = await createLesson({ courseId: course.id, moduleId: m1.id, title: 'Iz Šibenika', sessionNumbers: [4] })

    expect(res.success).toBe(true)
    expect(await db.lesson.count({ where: { courseId: course.id, title: 'Iz Šibenika' } })).toBe(1)
  })

  it('refuses a teacher session (requireAdmin redirects)', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER' })
    const { course, m1 } = await standardProgram()

    await expect(
      createLesson({ courseId: course.id, moduleId: m1.id, title: 'Nastavnikova', sessionNumbers: [5] }),
    ).rejects.toThrow(/NEXT_REDIRECT/)
    expect(await db.lesson.count({ where: { courseId: course.id } })).toBe(0)
  })
})

// ─── updateLesson ────────────────────────────────────────────────────────────

describe('updateLesson', () => {
  it('renames and replaces the sats', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id, title: 'Staro ime', sessionNumbers: [1] })

    const res = await updateLesson({ id: lesson.id, title: 'Novo ime', description: 'Opis', sessionNumbers: [3, 4] })

    expect(res).toEqual({ success: true })
    expect(await db.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).toMatchObject({
      title: 'Novo ime',
      description: 'Opis',
    })
    expect(await sessionsOf(lesson.id)).toEqual([3, 4])
  })

  it('refuses moving onto a sat another lesson holds, leaving the old sats', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()
    const mine = await seedLesson({ courseId: course.id, moduleId: m1.id, title: 'Moja', sessionNumbers: [1] })
    await seedLesson({ courseId: course.id, moduleId: m1.id, title: 'Zauzeta', sessionNumbers: [5] })

    const res = await updateLesson({ id: mine.id, title: 'Moja preimenovana', sessionNumbers: [4, 5] })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Zauzeta')
    expect(await db.lesson.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ title: 'Moja' })
    expect(await sessionsOf(mine.id)).toEqual([1])
  })
})

// ─── deleteLesson ────────────────────────────────────────────────────────────

describe('deleteLesson', () => {
  it('deletes an empty lesson and its sats', async () => {
    await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id, sessionNumbers: [1, 2] })

    expect(await deleteLesson(lesson.id)).toEqual({ success: true })
    expect(await db.lesson.count({ where: { id: lesson.id } })).toBe(0)
    expect(await db.lessonSession.count({ where: { lessonId: lesson.id } })).toBe(0)
  })

  it('refuses a lesson that still holds a material, with the count', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id, sessionNumbers: [1] })
    await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, uploadedById: admin.id })

    const res = await deleteLesson(lesson.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Lekcija ima 1 materijal')
    expect(await db.lesson.count({ where: { id: lesson.id } })).toBe(1)
    expect(await sessionsOf(lesson.id)).toEqual([1])
  })

  it("refuses a lesson holding only a group's own material", async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const group = await fx.group({ courseId: course.id, city: 'SPLIT' })
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    await seedMaterial({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: lesson.id, uploadedById: admin.id })
    await seedMaterial({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: lesson.id, uploadedById: admin.id })

    const res = await deleteLesson(lesson.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Lekcija ima 2 materijala')
    expect(await db.lesson.count({ where: { id: lesson.id } })).toBe(1)
  })

  it("reads another city's radionica lesson as missing", async () => {
    await sibenikAdmin()
    const course = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const lesson = await seedLesson({ courseId: course.id })

    expect(await deleteLesson(lesson.id)).toEqual({ success: false, error: 'Lekcija nije pronađena.' })
    expect(await db.lesson.count({ where: { id: lesson.id } })).toBe(1)
  })
})

// ─── setMaterialsAudience ────────────────────────────────────────────────────

describe('setMaterialsAudience', () => {
  it('an admin moves two lesson rows to the children', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const a = await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, audience: 'TEACHER', uploadedById: admin.id })
    const b = await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, audience: 'TEACHER', uploadedById: admin.id })

    expect(await setMaterialsAudience({ materialIds: [a.id, b.id], audience: 'STUDENT' })).toEqual({ success: true })
    const rows = await db.material.findMany({ where: { id: { in: [a.id, b.id] } }, select: { audience: true } })
    expect(rows.map((r) => r.audience)).toEqual(['STUDENT', 'STUDENT'])
  })

  it('refuses the whole batch when it contains a whole-program row', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const ok = await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, audience: 'TEACHER', uploadedById: admin.id })
    const whole = await seedMaterial({ scope: 'COURSE', courseId: course.id, uploadedById: admin.id, title: 'Cijeli program' })

    const res = await setMaterialsAudience({ materialIds: [ok.id, whole.id], audience: 'STUDENT' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Cijeli program')
    expect((await db.material.findUniqueOrThrow({ where: { id: ok.id } })).audience).toBe('TEACHER')
    expect((await db.material.findUniqueOrThrow({ where: { id: whole.id } })).audience).toBe('TEACHER')
  })

  it('refuses moving a RoboCamp guide to the teachers', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const guide = await seedMaterial({
      scope: 'LESSON',
      lessonId: lesson.id,
      type: 'ROBOCAMP',
      externalUrl: 'https://elearning.robocamp.eu/course/1',
      uploadedById: admin.id,
    })

    const res = await setMaterialsAudience({ materialIds: [guide.id], audience: 'TEACHER' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('RoboCamp')
    expect((await db.material.findUniqueOrThrow({ where: { id: guide.id } })).audience).toBe('STUDENT')
  })

  async function teacherWithGroup() {
    const { course, m1 } = await standardProgram()
    const group = await fx.group({ courseId: course.id, city: 'SPLIT' })
    const teacher = await createTeacher()
    const colleague = await createTeacher()
    await createTeacherAssignment(teacher.id, group.id)
    await createTeacherAssignment(colleague.id, group.id)
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    return { course, m1, group, teacher, colleague, lesson }
  }

  it('a teacher moves their own group row', async () => {
    const { group, teacher, lesson } = await teacherWithGroup()
    const own = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      lessonId: lesson.id,
      audience: 'TEACHER',
      uploadedById: teacher.id,
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    expect(await setMaterialsAudience({ materialIds: [own.id], audience: 'STUDENT' })).toEqual({ success: true })
    expect((await db.material.findUniqueOrThrow({ where: { id: own.id } })).audience).toBe('STUDENT')
  })

  it("refuses a teacher on a curriculum lesson row and on a colleague's group row", async () => {
    const { group, teacher, colleague, lesson } = await teacherWithGroup()
    const admin = await createAdmin()
    const curriculum = await seedMaterial({
      scope: 'LESSON',
      lessonId: lesson.id,
      audience: 'TEACHER',
      uploadedById: admin.id,
    })
    const colleagues = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      lessonId: lesson.id,
      audience: 'TEACHER',
      uploadedById: colleague.id,
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    for (const id of [curriculum.id, colleagues.id]) {
      const res = await setMaterialsAudience({ materialIds: [id], audience: 'STUDENT' })
      expect(res.success, id).toBe(false)
      if (!res.success) expect(res.error).toContain('Nemate dopuštenje')
      expect((await db.material.findUniqueOrThrow({ where: { id } })).audience).toBe('TEACHER')
    }
  })

  it("refuses an admin of another city on a Split group row and a Split radionica's lesson row", async () => {
    const splitAdminUser = await createAdmin({ city: 'SPLIT' })
    const { course, m1 } = await standardProgram()
    const group = await fx.group({ courseId: course.id, city: 'SPLIT' })
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const groupRow = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      lessonId: lesson.id,
      audience: 'TEACHER',
      uploadedById: splitAdminUser.id,
    })
    const radionica = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const radionicaLesson = await seedLesson({ courseId: radionica.id })
    const radionicaRow = await seedMaterial({
      scope: 'LESSON',
      lessonId: radionicaLesson.id,
      audience: 'TEACHER',
      uploadedById: splitAdminUser.id,
    })
    await sibenikAdmin()

    for (const id of [groupRow.id, radionicaRow.id]) {
      const res = await setMaterialsAudience({ materialIds: [id], audience: 'STUDENT' })
      expect(res.success, id).toBe(false)
      if (!res.success) expect(res.error).toContain('Nemate dopuštenje')
      expect((await db.material.findUniqueOrThrow({ where: { id } })).audience).toBe('TEACHER')
    }
  })
})

// ─── moveMaterialToLesson ────────────────────────────────────────────────────

describe('moveMaterialToLesson', () => {
  it('moves a lesson row to another lesson of the same module', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const from = await seedLesson({ courseId: course.id, moduleId: m1.id, sessionNumbers: [1] })
    const to = await seedLesson({ courseId: course.id, moduleId: m1.id, sessionNumbers: [2] })
    const mat = await seedMaterial({ scope: 'LESSON', lessonId: from.id, uploadedById: admin.id })

    expect(await moveMaterialToLesson({ materialId: mat.id, lessonId: to.id })).toEqual({ success: true })
    expect((await db.material.findUniqueOrThrow({ where: { id: mat.id } })).lessonId).toBe(to.id)
  })

  it('refuses a lesson of another module', async () => {
    const admin = await splitAdmin()
    const { course, m1, m2 } = await standardProgram()
    const from = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const to = await seedLesson({ courseId: course.id, moduleId: m2.id })
    const mat = await seedMaterial({ scope: 'LESSON', lessonId: from.id, uploadedById: admin.id })

    expect(await moveMaterialToLesson({ materialId: mat.id, lessonId: to.id })).toEqual({
      success: false,
      error: 'Materijal se može premjestiti samo u lekciju istog modula.',
    })
    expect((await db.material.findUniqueOrThrow({ where: { id: mat.id } })).lessonId).toBe(from.id)
  })

  it('refuses a lesson of another program', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const other = await standardProgram()
    const from = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const to = await seedLesson({ courseId: other.course.id, moduleId: other.m1.id })
    const mat = await seedMaterial({ scope: 'LESSON', lessonId: from.id, uploadedById: admin.id })

    const res = await moveMaterialToLesson({ materialId: mat.id, lessonId: to.id })

    expect(res.success).toBe(false)
    expect((await db.material.findUniqueOrThrow({ where: { id: mat.id } })).lessonId).toBe(from.id)
  })

  it('refuses a whole-program row (it sits in no lesson)', async () => {
    const admin = await splitAdmin()
    const { course, m1 } = await standardProgram()
    const to = await seedLesson({ courseId: course.id, moduleId: m1.id })
    const whole = await seedMaterial({ scope: 'COURSE', courseId: course.id, uploadedById: admin.id })

    expect(await moveMaterialToLesson({ materialId: whole.id, lessonId: to.id })).toEqual({
      success: false,
      error: 'Materijal za cijeli modul ili program nije u lekciji.',
    })
    expect((await db.material.findUniqueOrThrow({ where: { id: whole.id } })).lessonId).toBeNull()
  })
})

// ─── createMaterial across cities ────────────────────────────────────────────

describe("createMaterial — another city's radionica is not an admin's curriculum", () => {
  it("refuses a Šibenik admin's lesson material in a Split radionica", async () => {
    await sibenikAdmin()
    const radionica = await fx.course({ kind: 'RADIONICA', city: 'SPLIT' })
    const lesson = await seedLesson({ courseId: radionica.id })

    const res = await createMaterial({
      scope: 'LESSON',
      lessonId: lesson.id,
      audience: 'STUDENT',
      title: 'Iz Šibenika u Split',
      ...linkFields,
    })

    expect(res.success).toBe(false)
    expect(await db.material.count({ where: { lessonId: lesson.id } })).toBe(0)
  })

  it("accepts a Šibenik admin's lesson material in a shared standard program", async () => {
    const admin = await sibenikAdmin()
    const { course, m1 } = await standardProgram()
    const lesson = await seedLesson({ courseId: course.id, moduleId: m1.id })

    const res = await createMaterial({
      scope: 'LESSON',
      lessonId: lesson.id,
      audience: 'STUDENT',
      title: 'Zajednički kurikulum',
      ...linkFields,
    })

    expect(res).toEqual({ success: true })
    const row = await db.material.findFirstOrThrow({ where: { lessonId: lesson.id } })
    expect(row).toMatchObject({ scope: 'LESSON', audience: 'STUDENT', uploadedById: admin.id })
  })
})
