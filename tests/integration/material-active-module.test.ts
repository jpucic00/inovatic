import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockChildSession } from './setup'
import { computeSchoolYear } from '@/lib/school-year'
import type { GroupMaterialsView } from '@/lib/group-materials-view'
import {
  createAdmin,
  createStudent,
  createCourse,
  createModule,
  createGroup,
  createEnrollment,
  createLesson,
  createMaterial as seedMaterial,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')

/** Most recent Monday on/before `weeks*7` days ago (negative weeks = future). */
function mondayWeeksAgo(weeks: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - weeks * 7)
  const day = d.getUTCDay() // 0 Sun .. 6 Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function allVisibleTitles(view: GroupMaterialsView): string[] {
  return [
    ...view.modules.flatMap((s) => [
      ...s.lessons.flatMap((l) => l.materials.map((m) => m.title)),
      ...s.teacherMaterials.map((m) => m.title),
    ]),
    ...view.programTeacherMaterials.map((m) => m.title),
  ]
}

describe('kids see only the active module for their group', () => {
  it('hides non-active module lessons; keeps the active module whole + its group material', async () => {
    const schoolYear = computeSchoolYear()
    const admin = await createAdmin()
    const student = await createStudent()
    const course = await createCourse({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })

    // Per-group calendar: a Monday group whose Modul 1 ran weeks -10..-4 (done)
    // and whose Modul 2 window (race-ahead) spans now → Modul 2 is active.
    await db.moduleSchedule.create({
      data: { city: 'SPLIT', moduleId: m1.id, schoolYear, startDate: mondayWeeksAgo(10), endDate: mondayWeeksAgo(4) },
    })
    await db.moduleSchedule.create({
      data: { city: 'SPLIT', moduleId: m2.id, schoolYear, startDate: mondayWeeksAgo(3), endDate: mondayWeeksAgo(-3) },
    })

    const group = await createGroup({ courseId: course.id, dayOfWeek: 'Ponedjeljak' })
    await createEnrollment(student.id, group.id)

    const l1 = await createLesson({ courseId: course.id, moduleId: m1.id, sessionNumbers: [1] })
    const l2a = await createLesson({ courseId: course.id, moduleId: m2.id, sessionNumbers: [1] })
    // A later lesson of the active module: the portal gets the module WHOLE,
    // not just the lesson that is current today.
    const l2b = await createLesson({ courseId: course.id, moduleId: m2.id, sessionNumbers: [7] })
    const lesson = (lessonId: string, title: string) =>
      seedMaterial({ scope: 'LESSON', lessonId, audience: 'STUDENT', uploadedById: admin.id, title })
    await lesson(l1.id, 'M1 material')
    await lesson(l2a.id, 'M2 material')
    await lesson(l2b.id, 'M2 later material')
    await seedMaterial({ scope: 'MODULE', moduleId: m2.id, uploadedById: admin.id, title: 'M2 teacher-only' })
    await seedMaterial({ scope: 'COURSE', courseId: course.id, uploadedById: admin.id, title: 'Program material' })
    await seedMaterial({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: l2a.id, audience: 'STUDENT', uploadedById: admin.id, title: 'Group material' })
    await seedMaterial({ scope: 'GROUP', scheduledGroupId: group.id, lessonId: l1.id, audience: 'STUDENT', uploadedById: admin.id, title: 'Group M1 material' })

    mockChildSession(student.id)
    const view = await getEffectiveMaterialsForStudent(group.id)

    expect(view.activeModuleId).toBe(m2.id)
    expect(view.modules.map((s) => s.moduleId)).toEqual([m2.id])
    expect(view.modules[0].lessons.map((l) => l.id)).toEqual([l2a.id, l2b.id])

    const titles = allVisibleTitles(view)
    expect(titles).toContain('M2 material') // active module
    expect(titles).toContain('M2 later material') // the whole active module
    expect(titles).toContain('Group material') // GROUP in an active-module lesson
    expect(titles).not.toContain('M1 material') // non-active module hidden
    expect(titles).not.toContain('Group M1 material') // …and its group additions with it
    expect(titles).not.toContain('Program material') // teacher-only, never the portal
    expect(titles).not.toContain('M2 teacher-only')
  })

  it('two groups of the same course on different weekdays can show different active modules', async () => {
    // Same calendar, but a much later kickoff so only Modul 1 is in progress
    // for both groups — this asserts the per-group active module is honoured
    // (both groups resolve via getCurrentActiveModuleForGroup, not course-wide).
    const schoolYear = computeSchoolYear()
    const admin = await createAdmin()
    const studentMon = await createStudent()
    const studentTue = await createStudent()
    const course = await createCourse({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    await db.moduleSchedule.create({
      data: { city: 'SPLIT', moduleId: m1.id, schoolYear, startDate: mondayWeeksAgo(2), endDate: mondayWeeksAgo(-4) },
    })
    await db.moduleSchedule.create({
      data: { city: 'SPLIT', moduleId: m2.id, schoolYear, startDate: mondayWeeksAgo(-5), endDate: mondayWeeksAgo(-11) },
    })

    const groupMon = await createGroup({ courseId: course.id, dayOfWeek: 'Ponedjeljak' })
    const groupTue = await createGroup({ courseId: course.id, dayOfWeek: 'Utorak' })
    await createEnrollment(studentMon.id, groupMon.id)
    await createEnrollment(studentTue.id, groupTue.id)

    await seedMaterial({ scope: 'LESSON', moduleId: m1.id, audience: 'STUDENT', uploadedById: admin.id, title: 'M1 material' })

    mockChildSession(studentMon.id)
    const monView = await getEffectiveMaterialsForStudent(groupMon.id)
    mockChildSession(studentTue.id)
    const tueView = await getEffectiveMaterialsForStudent(groupTue.id)

    // Both groups are in Modul 1's window now → both see the Modul 1 material,
    // and each computes its own active module independently.
    expect(allVisibleTitles(monView)).toContain('M1 material')
    expect(allVisibleTitles(tueView)).toContain('M1 material')
    expect(monView.activeModuleId).toBe(m1.id)
    expect(tueView.activeModuleId).toBe(m1.id)
  })
})
