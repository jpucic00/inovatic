/**
 * A parent sees only the CURRENT lesson (owner, 2026-10-26).
 *
 *   - a natjecanje lesson on weekly season sats is placed on the group's own
 *     season (sat N = the Nth weekly termin) and the parent gets only the
 *     current one, while a natjecanje whose lessons have no sats keeps them all;
 *   - the download route refuses a parent a file from a non-current lesson of a
 *     dated section, and still serves the current one — the classroom keeps the
 *     whole module, there and on the page.
 *
 * The standard-program page cut lives in materials-v2.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { GET } from '@/app/api/download/[materialId]/route'
import { mockChildSession, mockSession } from './setup'
import {
  classroomAccount,
  createAdmin,
  createCourseSeason,
  createEnrollment,
  createLesson,
  createMaterial,
  createModule,
  createStudent,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')

const fx = fixtureScope()

let upstreamSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  upstreamSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response('x', { status: 200 }))
})
afterAll(async () => {
  upstreamSpy.mockRestore()
  await fx.cleanup()
})

/** Most recent Monday on/before `weeks*7` days ago (negative weeks = future). */
function mondayWeeksAgo(weeks: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - weeks * 7)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d
}

const download = (materialId: string) =>
  GET(new Request(`http://localhost/api/download/${materialId}`), {
    params: Promise.resolve({ materialId }),
  })

/**
 * A Monday natjecanje group whose season began four Mondays ago: sat 1 was
 * four weeks back, sat 3 two weeks back, sat 10 is still ahead. The FLL
 * natjecanje has dated lessons on sats 1, 3 and 10; Pripreme's lesson has none.
 */
async function seedCompetitionGroup() {
  const schoolYear = computeSchoolYear()
  const admin = await createAdmin()
  const course = await fx.course({ kind: 'COMPETITION' })
  const fll = await createModule(course.id, { title: 'FLL', sortOrder: 0 })
  const prip = await createModule(course.id, { title: 'Pripreme', sortOrder: 1 })
  await createCourseSeason(course.id, {
    schoolYear,
    city: 'SPLIT',
    startDate: mondayWeeksAgo(4),
    endDate: mondayWeeksAgo(-30),
  })
  const group = await fx.group({ courseId: course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT', schoolYear })

  const a = await createLesson({ courseId: course.id, moduleId: fll.id, title: 'FLL prva', sessionNumbers: [1] })
  const b = await createLesson({ courseId: course.id, moduleId: fll.id, title: 'FLL druga', sessionNumbers: [3] })
  const c = await createLesson({ courseId: course.id, moduleId: fll.id, title: 'FLL kasnija', sessionNumbers: [10] })
  const p = await createLesson({ courseId: course.id, moduleId: prip.id, title: 'Pripreme lekcija' })

  const doc = (lessonId: string, title: string) =>
    createMaterial({
      scope: 'LESSON',
      lessonId,
      audience: 'STUDENT',
      title,
      type: 'DOCUMENT',
      fileUrl: `https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/${title}.pdf`,
      externalUrl: null,
      uploadedById: admin.id,
    })
  const files = {
    a: await doc(a.id, 'fll-a'),
    b: await doc(b.id, 'fll-b'),
    c: await doc(c.id, 'fll-c'),
    p: await doc(p.id, 'prip'),
  }

  const student = await createStudent()
  await createEnrollment(student.id, group.id, { schoolYear })
  return { group, fll, prip, a, b, c, p, files, student }
}

describe('natjecanje lessons on weekly season sats', () => {
  it('gives a parent only the current lesson of a dated natjecanje, and every lesson of an undated one', async () => {
    const s = await seedCompetitionGroup()

    mockChildSession(s.student.id)
    const view = await getEffectiveMaterialsForStudent(s.group.id)

    const fll = view.modules.find((m) => m.moduleId === s.fll.id)!
    expect(fll.dated).toBe(true)
    expect(fll.lessons.map((l) => l.id)).toEqual([s.b.id])
    expect(fll.lessons[0].firstDate?.toISOString().slice(0, 10)).toBe(
      mondayWeeksAgo(2).toISOString().slice(0, 10),
    )

    const prip = view.modules.find((m) => m.moduleId === s.prip.id)!
    expect(prip.dated).toBe(false)
    expect(prip.lessons.map((l) => l.id)).toEqual([s.p.id])
  })

  it('leaves the classroom every lesson of the natjecanje, with the current one marked', async () => {
    const s = await seedCompetitionGroup()
    const row = await classroomAccount('SPLIT')

    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    const view = await getEffectiveMaterialsForStudent(s.group.id)

    const fll = view.modules.find((m) => m.moduleId === s.fll.id)!
    expect(fll.lessons.map((l) => l.id)).toEqual([s.a.id, s.b.id, s.c.id])
    expect(fll.currentLessonId).toBe(s.b.id)
  })
})

describe('GET /api/download — a parent downloads only the current lesson', () => {
  it('serves the current lesson and an undated section, refuses past and future lessons', async () => {
    const s = await seedCompetitionGroup()

    mockChildSession(s.student.id)
    expect((await download(s.files.b.id)).status).toBe(200)
    expect((await download(s.files.p.id)).status).toBe(200)
    expect((await download(s.files.a.id)).status).toBe(404)
    expect((await download(s.files.c.id)).status).toBe(404)
  })

  it('still lets the classroom download any lesson of the module', async () => {
    const s = await seedCompetitionGroup()
    const row = await classroomAccount('SPLIT')

    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await download(s.files.a.id)).status).toBe(200)
    expect((await download(s.files.c.id)).status).toBe(200)
  })

  it('refuses a parent once the lesson they had is no longer current', async () => {
    const s = await seedCompetitionGroup()
    // Move "FLL druga" ahead of today: "FLL prva" becomes current instead.
    await db.lessonSession.updateMany({ where: { lessonId: s.b.id }, data: { sessionNumber: 20 } })

    mockChildSession(s.student.id)
    expect((await download(s.files.b.id)).status).toBe(404)
    expect((await download(s.files.a.id)).status).toBe(200)
  })
})

describe('GET /api/download — the cut covers group additions and a season not yet started', () => {
  it("refuses a parent the group's own file in a past lesson, the classroom keeps it", async () => {
    const s = await seedCompetitionGroup()
    const own = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: s.group.id,
      lessonId: s.a.id,
      audience: 'STUDENT',
      title: 'grupa-prva',
      type: 'DOCUMENT',
      fileUrl: 'https://res.cloudinary.com/dgc2tp4f8/raw/upload/v1/test/grupa-prva.pdf',
      externalUrl: null,
    })

    mockChildSession(s.student.id)
    expect((await download(own.id)).status).toBe(404)

    const row = await classroomAccount('SPLIT')
    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expect((await download(own.id)).status).toBe(200)
  })

  it('refuses a parent every dated lesson before the season starts', async () => {
    const s = await seedCompetitionGroup()
    await db.courseSeason.updateMany({
      where: { courseId: s.group.courseId },
      data: { startDate: mondayWeeksAgo(-2), endDate: mondayWeeksAgo(-30) },
    })

    mockChildSession(s.student.id)
    for (const file of [s.files.a, s.files.b, s.files.c]) {
      expect((await download(file.id)).status).toBe(404)
    }
    expect((await download(s.files.p.id)).status).toBe(200)
  })
})
