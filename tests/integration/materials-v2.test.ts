/**
 * Materijali v2 (Flux av4885t): materials live in LESSONS (program → module →
 * lesson → material) and carry an audience.
 *
 * The rules under test:
 *   - the portal (a parent's picked child, the classroom login) runs the STUDENT
 *     viewer: only STUDENT rows, only inside lessons, only the module the group
 *     is on now — but that module WHOLE, every lesson of it;
 *   - staff run STAFF: both audiences, every module, plus the teacher-only
 *     whole-module (MODULE) and whole-program (COURSE) rows;
 *   - createMaterial: a teacher adds GROUP rows only, into a lesson of their own
 *     group's program; a RoboCamp guide is always for the children; the DB
 *     backs the shape and audience rules with CHECK constraints;
 *   - a lesson's current-ness follows its sat numbers on the group's own arc.
 *
 * The download route's audience rule lives in api/download.test.ts, and
 * deleteCourse's lesson handling in admin-course-delete.test.ts.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { buildGroupMaterialsView, type GroupMaterialsView } from '@/lib/group-materials-view'
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

const { createMaterial, updateMaterial } = await import('@/actions/material/crud')
const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')

const fx = fixtureScope()

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
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

function lessonMaterialTitles(view: GroupMaterialsView): string[] {
  return view.modules.flatMap((s) => s.lessons.flatMap((l) => l.materials.map((m) => m.title)))
}

const linkFields = {
  type: 'LINK' as const,
  fileUrl: null,
  externalUrl: 'https://example.com/x',
  description: null,
  fileSize: null,
  mimeType: null,
  sortOrder: 0,
}

// ─── STUDENT vs STAFF view ───────────────────────────────────────────────────

describe('lesson view — the portal sees the active module whole, staff see everything', () => {
  /**
   * A standard Monday group whose module 1 is behind it and module 2 in
   * progress, with a STUDENT and a TEACHER row on every level a row can sit.
   */
  async function seedStandardGroup() {
    const schoolYear = computeSchoolYear()
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    await createModuleSchedule(m1.id, {
      schoolYear,
      startDate: mondayWeeksAgo(10),
      endDate: mondayWeeksAgo(4),
    })
    await createModuleSchedule(m2.id, {
      schoolYear,
      startDate: mondayWeeksAgo(3),
      endDate: mondayWeeksAgo(-3),
    })
    const group = await fx.group({ courseId: course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT' })

    const l1 = await createLesson({ courseId: course.id, moduleId: m1.id, title: 'M1 lekcija', sessionNumbers: [1] })
    const l2a = await createLesson({ courseId: course.id, moduleId: m2.id, title: 'M2 prva', sessionNumbers: [1, 2] })
    const l2b = await createLesson({ courseId: course.id, moduleId: m2.id, title: 'M2 druga', sessionNumbers: [3] })

    const row = (o: Parameters<typeof seedMaterial>[0]) => seedMaterial({ uploadedById: admin.id, ...o })
    await row({ scope: 'LESSON', lessonId: l1.id, audience: 'STUDENT', title: 'M1 za djecu' })
    await row({ scope: 'LESSON', lessonId: l2a.id, audience: 'STUDENT', title: 'M2a za djecu' })
    await row({ scope: 'LESSON', lessonId: l2a.id, audience: 'TEACHER', title: 'M2a za nastavnike' })
    await row({ scope: 'LESSON', lessonId: l2b.id, audience: 'STUDENT', title: 'M2b za djecu' })
    await row({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: l2b.id, audience: 'STUDENT', title: 'Grupa za djecu' })
    await row({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: l2b.id, audience: 'TEACHER', title: 'Grupa za nastavnike' })
    await row({ scope: 'MODULE', moduleId: m2.id, title: 'Cijeli modul 2' })
    await row({ scope: 'COURSE', courseId: course.id, title: 'Cijeli program' })

    return { course, group, m1, m2, l1, l2a, l2b }
  }

  function expectStudentView(view: GroupMaterialsView, s: Awaited<ReturnType<typeof seedStandardGroup>>) {
    expect(view.viewer).toBe('STUDENT')
    expect(view.activeModuleId).toBe(s.m2.id)
    // Only the module the group is on now — but every lesson of it.
    expect(view.modules.map((m) => m.moduleId)).toEqual([s.m2.id])
    expect(view.modules[0].lessons.map((l) => l.id)).toEqual([s.l2a.id, s.l2b.id])
    expect(view.modules[0].lessons[0].sessionNumbers).toEqual([1, 2])

    expect(lessonMaterialTitles(view).sort()).toEqual(
      ['Grupa za djecu', 'M2a za djecu', 'M2b za djecu'].sort(),
    )
    // Every item that reaches the portal is STUDENT-audience.
    expect(
      view.modules.every((m) => m.lessons.every((l) => l.materials.every((i) => i.audience === 'STUDENT'))),
    ).toBe(true)
    // The teacher-only whole-module / whole-program rows never reach it.
    expect(view.modules.every((m) => m.teacherMaterials.length === 0)).toBe(true)
    expect(view.programTeacherMaterials).toEqual([])
  }

  it('a parent with the child chosen gets only STUDENT rows of the active module', async () => {
    const s = await seedStandardGroup()
    const student = await createStudent()
    await createEnrollment(student.id, s.group.id)

    mockChildSession(student.id)
    expectStudentView(await getEffectiveMaterialsForStudent(s.group.id), s)
  })

  it('the classroom login gets exactly the same STUDENT view', async () => {
    const s = await seedStandardGroup()
    const row = await classroomAccount('SPLIT')

    mockSession({ id: row.id, role: 'CLASSROOM', city: 'SPLIT' })
    expectStudentView(await getEffectiveMaterialsForStudent(s.group.id), s)
  })

  it('STAFF sees both audiences, every module, and the teacher-only rows', async () => {
    const s = await seedStandardGroup()

    const view = await buildGroupMaterialsView(s.group.id, 'STAFF')

    expect(view.viewer).toBe('STAFF')
    expect(view.modules.map((m) => m.moduleId)).toEqual([s.m1.id, s.m2.id])
    expect(view.modules.find((m) => m.moduleId === s.m2.id)?.isActive).toBe(true)
    expect(lessonMaterialTitles(view).sort()).toEqual(
      [
        'M1 za djecu',
        'M2a za djecu',
        'M2a za nastavnike',
        'M2b za djecu',
        'Grupa za djecu',
        'Grupa za nastavnike',
      ].sort(),
    )
    expect(view.modules.find((m) => m.moduleId === s.m2.id)?.teacherMaterials.map((i) => i.title)).toEqual([
      'Cijeli modul 2',
    ])
    expect(view.modules.find((m) => m.moduleId === s.m1.id)?.teacherMaterials).toEqual([])
    expect(view.programTeacherMaterials.map((i) => i.title)).toEqual(['Cijeli program'])
  })

  it("STAFF does not see another group's own rows of the same program", async () => {
    const s = await seedStandardGroup()
    const other = await fx.group({ courseId: s.course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT' })
    await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: other.id,
      lessonId: s.l2a.id,
      audience: 'TEACHER',
      title: 'Tuđa grupa',
    })

    const view = await buildGroupMaterialsView(s.group.id, 'STAFF')
    expect(lessonMaterialTitles(view)).not.toContain('Tuđa grupa')
  })
})

// ─── createMaterial: who may add what, where ─────────────────────────────────

describe('createMaterial — Materijali v2 rules', () => {
  async function teacherOnOwnGroup() {
    const teacher = await createTeacher()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    const group = await fx.group({ courseId: course.id })
    await createTeacherAssignment(teacher.id, group.id)
    const lesson = await createLesson({ courseId: course.id, moduleId: mod.id, sessionNumbers: [1] })
    mockSession({ id: teacher.id, role: 'TEACHER' })
    return { teacher, course, mod, group, lesson }
  }

  it("refuses a teacher's GROUP material placed in a lesson of another program", async () => {
    const { group } = await teacherOnOwnGroup()
    const otherCourse = await fx.course({ kind: 'STANDARD' })
    const foreignLesson = await createLesson({ courseId: otherCourse.id })

    const res = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      lessonId: foreignLesson.id,
      audience: 'STUDENT',
      title: 'Krivi program',
      ...linkFields,
    })

    expect(res).toEqual({ success: false, error: 'Lekcija ne pripada programu ove grupe.' })
    expect(await db.material.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('accepts a teacher-only GROUP row in a lesson of their own program', async () => {
    const { group, lesson, teacher } = await teacherOnOwnGroup()

    const res = await createMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      lessonId: lesson.id,
      audience: 'TEACHER',
      title: 'Moja priprema',
      ...linkFields,
    })

    expect(res).toEqual({ success: true })
    const row = await db.material.findFirstOrThrow({ where: { scheduledGroupId: group.id } })
    expect(row).toMatchObject({ scope: 'GROUP', audience: 'TEACHER', lessonId: lesson.id, uploadedById: teacher.id })
  })

  it('refuses a teacher LESSON, MODULE or COURSE material — curriculum is admin-owned', async () => {
    const { course, mod, lesson } = await teacherOnOwnGroup()

    const attempts = [
      { scope: 'LESSON' as const, lessonId: lesson.id, audience: 'STUDENT' as const },
      { scope: 'MODULE' as const, moduleId: mod.id },
      { scope: 'COURSE' as const, courseId: course.id },
    ]
    for (const target of attempts) {
      const res = await createMaterial({ ...target, title: `Pokušaj ${target.scope}`, ...linkFields })
      expect(res.success, target.scope).toBe(false)
      if (!res.success) expect(res.error).toContain('samo na razini grupe')
    }
    expect(await db.material.count({ where: { title: { startsWith: 'Pokušaj ' }, lesson: { courseId: course.id } } })).toBe(0)
    expect(await db.material.count({ where: { OR: [{ moduleId: mod.id }, { courseId: course.id }] } })).toBe(0)
  })

  it('refuses a RoboCamp guide meant for the teachers', async () => {
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    const lesson = await createLesson({ courseId: course.id, moduleId: mod.id, sessionNumbers: [2] })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createMaterial({
      scope: 'LESSON',
      lessonId: lesson.id,
      audience: 'TEACHER',
      title: 'Vodič za nastavnike',
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://elearning.robocamp.eu/course/1',
      sortOrder: 0,
    })

    expect(res).toEqual({ success: false, error: 'RoboCamp vodič je materijal za polaznike.' })
    expect(await db.material.count({ where: { lessonId: lesson.id } })).toBe(0)
  })

  it('refuses turning a teacher-only row into a RoboCamp guide on edit', async () => {
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    const mat = await seedMaterial({ scope: 'LESSON', moduleId: mod.id, audience: 'TEACHER', uploadedById: admin.id })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await updateMaterial({
      id: mat.id,
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://elearning.robocamp.eu/course/2',
    })

    expect(res).toEqual({ success: false, error: 'RoboCamp vodič je materijal za polaznike.' })
    expect((await db.material.findUniqueOrThrow({ where: { id: mat.id } })).type).toBe('LINK')
  })

  it('an admin MODULE row is stamped TEACHER and sits in no lesson', async () => {
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createMaterial({ scope: 'MODULE', moduleId: mod.id, title: 'Za sve satove modula', ...linkFields })

    expect(res).toEqual({ success: true })
    const row = await db.material.findFirstOrThrow({ where: { moduleId: mod.id } })
    expect(row).toMatchObject({ scope: 'MODULE', audience: 'TEACHER', lessonId: null, courseId: null })
  })
})

// ─── The database backs the rules ────────────────────────────────────────────

describe('database constraints', () => {
  async function base() {
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    return { admin, course, mod }
  }

  it('refuses a STUDENT whole-module row (Material_v2_shape_check)', async () => {
    const { admin, mod } = await base()
    await expect(
      db.material.create({
        data: {
          scope: 'MODULE',
          audience: 'STUDENT',
          moduleId: mod.id,
          title: 'Modul za djecu',
          type: 'LINK',
          externalUrl: 'https://example.com',
          uploadedById: admin.id,
        },
      }),
    ).rejects.toThrow(/Material_v2_shape_check/)
  })

  it('refuses a LESSON row that also names a course (Material_v2_shape_check)', async () => {
    const { admin, course } = await base()
    const lesson = await createLesson({ courseId: course.id })
    await expect(
      db.material.create({
        data: {
          scope: 'LESSON',
          audience: 'STUDENT',
          lessonId: lesson.id,
          courseId: course.id,
          title: 'Dvostruko smješten',
          type: 'LINK',
          externalUrl: 'https://example.com',
          uploadedById: admin.id,
        },
      }),
    ).rejects.toThrow(/Material_v2_shape_check/)
  })

  it('refuses a TEACHER RoboCamp row (Material_robocamp_student_check)', async () => {
    const { admin, course } = await base()
    const lesson = await createLesson({ courseId: course.id })
    await expect(
      db.material.create({
        data: {
          scope: 'LESSON',
          audience: 'TEACHER',
          lessonId: lesson.id,
          title: 'Vodič za nastavnike',
          type: 'ROBOCAMP',
          externalUrl: 'https://elearning.robocamp.eu/course/1',
          uploadedById: admin.id,
        },
      }),
    ).rejects.toThrow(/Material_robocamp_student_check/)
  })

  it('refuses two lessons on the same (module, sat)', async () => {
    const { course, mod } = await base()
    await createLesson({ courseId: course.id, moduleId: mod.id, sessionNumbers: [3] })
    await expect(
      createLesson({ courseId: course.id, moduleId: mod.id, sessionNumbers: [3] }),
    ).rejects.toThrow(/Unique constraint|P2002/)
    // The same sat in ANOTHER module is a different slot.
    const other = await createModule(course.id, { sortOrder: 1 })
    await expect(
      createLesson({ courseId: course.id, moduleId: other.id, sessionNumbers: [3] }),
    ).resolves.toBeTruthy()
  })

  it('refuses a sat outside 0–7 (LessonSession_number_check)', async () => {
    const { course, mod } = await base()
    await expect(
      createLesson({ courseId: course.id, moduleId: mod.id, sessionNumbers: [8] }),
    ).rejects.toThrow(/LessonSession_number_check/)
  })

  it("refuses a lesson whose module belongs to another program (composite FK)", async () => {
    const { course } = await base()
    const otherCourse = await fx.course({ kind: 'STANDARD' })
    const foreignModule = await createModule(otherCourse.id)
    await expect(createLesson({ courseId: course.id, moduleId: foreignModule.id })).rejects.toThrow()
  })

  it('refuses deleting a lesson that still holds a material (Material → Lesson RESTRICT)', async () => {
    const { admin, course } = await base()
    const lesson = await createLesson({ courseId: course.id })
    await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, uploadedById: admin.id })
    await expect(db.lesson.delete({ where: { id: lesson.id } })).rejects.toThrow()
    expect(await db.lesson.count({ where: { id: lesson.id } })).toBe(1)
  })
})

// ─── The current lesson, end to end ──────────────────────────────────────────

describe('current lesson follows the sat numbers on the group arc', () => {
  it('marks the sat-1 lesson current between sat 1 and sat 3, then the sat-3 lesson', async () => {
    const schoolYear = computeSchoolYear()
    const startYear = schoolYear.slice(0, 4)
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const mod = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    await createModuleSchedule(mod.id, {
      schoolYear,
      city: 'SPLIT',
      startDate: new Date(`${startYear}-10-01T00:00:00Z`),
      endDate: new Date(`${startYear}-11-30T00:00:00Z`),
    })
    const group = await fx.group({
      courseId: course.id,
      dayOfWeek: 'Ponedjeljak',
      city: 'SPLIT',
      schoolYear,
    })
    const sat1 = await createLesson({ courseId: course.id, moduleId: mod.id, title: '1. Puž', sessionNumbers: [1] })
    const sat3 = await createLesson({ courseId: course.id, moduleId: mod.id, title: '2. Vrtuljak', sessionNumbers: [3] })
    await seedMaterial({ scope: 'LESSON', lessonId: sat1.id, audience: 'STUDENT', uploadedById: admin.id })
    await seedMaterial({ scope: 'LESSON', lessonId: sat3.id, audience: 'STUDENT', uploadedById: admin.id })

    // Before the module starts: the lessons are already dated on THIS group's
    // calendar, and nothing is current yet.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${startYear}-09-20T10:00:00Z`) })
    const before = await buildGroupMaterialsView(group.id, 'STAFF')
    const section = before.modules.find((m) => m.moduleId === mod.id)
    expect(section?.lessons.map((l) => l.id)).toEqual([sat1.id, sat3.id])
    expect(section?.currentLessonId).toBeNull()
    const d1 = section?.lessons[0].firstDate
    const d3 = section?.lessons[1].firstDate
    expect(d1).toBeInstanceOf(Date)
    expect(d3).toBeInstanceOf(Date)
    expect((d1 as Date).getUTCDay()).toBe(1) // a Monday group
    expect((d3 as Date).getTime()).toBeGreaterThan((d1 as Date).getTime())

    // The day after sat 1: the sat-1 lesson is current and the portal (STUDENT)
    // shows the module that is running, with both lessons.
    const between = new Date((d1 as Date).getTime() + 86_400_000 + 10 * 3_600_000)
    expect(between.getTime()).toBeLessThan((d3 as Date).getTime())
    vi.setSystemTime(between)
    const mid = await buildGroupMaterialsView(group.id, 'STUDENT')
    expect(mid.activeModuleId).toBe(mod.id)
    expect(mid.modules).toHaveLength(1)
    expect(mid.modules[0].currentLessonId).toBe(sat1.id)
    expect(mid.modules[0].lessons.map((l) => [l.id, l.isCurrent])).toEqual([
      [sat1.id, true],
      [sat3.id, false],
    ])

    // On the day of sat 3 the next lesson takes over.
    vi.setSystemTime(new Date((d3 as Date).getTime() + 10 * 3_600_000))
    const later = await buildGroupMaterialsView(group.id, 'STUDENT')
    expect(later.modules[0].currentLessonId).toBe(sat3.id)
  })

  it("paces a next-year group off its OWN year's dates, not the year today still names", async () => {
    // Mid-July: today's date still names the ending year (2030/2031), while the
    // group was created for the one starting in September.
    const ending = '2030/2031'
    const next = '2031/2032'
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    const plan = async (moduleId: string, schoolYear: string, start: string, end: string) =>
      createModuleSchedule(moduleId, {
        schoolYear,
        city: 'SPLIT',
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: new Date(`${end}T00:00:00Z`),
      })
    await plan(m1.id, ending, '2030-10-01', '2030-11-30')
    await plan(m2.id, ending, '2031-01-07', '2031-06-15')
    await plan(m1.id, next, '2031-10-01', '2031-11-30')
    await plan(m2.id, next, '2032-01-07', '2032-06-15')
    const group = await fx.group({
      courseId: course.id,
      dayOfWeek: 'Ponedjeljak',
      city: 'SPLIT',
      schoolYear: next,
    })
    const lesson = await createLesson({ courseId: course.id, moduleId: m1.id, title: '1. Puž', sessionNumbers: [1] })
    await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, audience: 'STUDENT', uploadedById: admin.id })

    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-07-15T10:00:00Z') })

    // Last year's arc would put the group past module 2; its own year has not
    // started, so the portal shows module 1, the one it is enrolling into.
    const portal = await buildGroupMaterialsView(group.id, 'STUDENT')
    expect(portal.activeModuleId).toBe(m1.id)
    expect(portal.modules.map((m) => m.moduleId)).toEqual([m1.id])

    // Sat 1 is dated on the group's own calendar: the first Monday of October 2031.
    const staff = await buildGroupMaterialsView(group.id, 'STAFF')
    const firstDate = staff.modules.find((m) => m.moduleId === m1.id)?.lessons[0].firstDate
    expect(firstDate?.toISOString().slice(0, 10)).toBe('2031-10-06')
  })

  it("skips holidays from the group's OWN year when dating a next-year group's sats", async () => {
    // Own years so the holiday below cannot reach any other test's arc.
    const ending = '2034/2035'
    const next = '2035/2036'
    const admin = await createAdmin()
    const course = await fx.course({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    await createModuleSchedule(m1.id, {
      schoolYear: ending,
      city: 'SPLIT',
      startDate: new Date('2034-10-01T00:00:00Z'),
      endDate: new Date('2034-11-30T00:00:00Z'),
    })
    await createModuleSchedule(m1.id, {
      schoolYear: next,
      city: 'SPLIT',
      startDate: new Date('2035-10-01T00:00:00Z'),
      endDate: new Date('2035-11-30T00:00:00Z'),
    })
    const group = await fx.group({ courseId: course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT', schoolYear: next })
    const lesson = await createLesson({ courseId: course.id, moduleId: m1.id, title: '1. Puž', sessionNumbers: [1] })
    await seedMaterial({ scope: 'LESSON', lessonId: lesson.id, audience: 'STUDENT', uploadedById: admin.id })
    // 1 October 2035 is a Monday — the group's first sat, unless it is a holiday.
    await db.schoolYear.upsert({ where: { label: next }, create: { label: next }, update: {} })
    const holiday = await db.schoolYearHoliday.create({
      data: { city: 'SPLIT', schoolYear: next, date: new Date(Date.UTC(2035, 9, 1)), name: 'Test' },
    })

    try {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2035-07-15T10:00:00Z') })
      const staff = await buildGroupMaterialsView(group.id, 'STAFF')
      const firstDate = staff.modules.find((m) => m.moduleId === m1.id)?.lessons[0].firstDate
      // Read off today's year (2034/2035) the holiday would be missed and sat 1 stay on the 1st.
      expect(firstDate?.toISOString().slice(0, 10)).toBe('2035-10-08')
    } finally {
      await db.schoolYearHoliday.delete({ where: { id: holiday.id } })
    }
  })
})
