import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { computeSchoolYear } from '@/lib/school-year'
import type { GroupMaterialsView, KindBuckets } from '@/lib/group-materials-view'
import {
  createAdmin,
  createStudent,
  createCourse,
  createModule,
  createGroup,
  createEnrollment,
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

function bucketTitles(b: KindBuckets): string[] {
  return [...b.robocamp, ...b.videos, ...b.docs, ...b.links].map((m) => m.title)
}

function allVisibleTitles(view: GroupMaterialsView): string[] {
  return [
    ...view.moduleSections.flatMap((s) => bucketTitles(s.buckets)),
    ...bucketTitles(view.programMaterials),
    ...bucketTitles(view.groupMaterials),
    ...bucketTitles(view.radionicaMaterials),
  ]
}

describe('kids see only the active module for their group', () => {
  it('hides non-active module materials; keeps active module + program-wide + group', async () => {
    const schoolYear = computeSchoolYear()
    const admin = await createAdmin()
    const student = await createStudent()
    const course = await createCourse({ isCustom: false })
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

    await seedMaterial({ scope: 'MODULE', moduleId: m1.id, type: 'LINK', uploadedById: admin.id, title: 'M1 material' })
    await seedMaterial({ scope: 'MODULE', moduleId: m2.id, type: 'LINK', uploadedById: admin.id, title: 'M2 material' })
    await seedMaterial({ scope: 'COURSE', courseId: course.id, type: 'LINK', uploadedById: admin.id, title: 'Program material' })
    await seedMaterial({ scope: 'GROUP', scheduledGroupId: group.id, type: 'LINK', uploadedById: admin.id, title: 'Group material' })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getEffectiveMaterialsForStudent(group.id)

    expect(view.activeModuleId).toBe(m2.id)
    expect(view.moduleSections.map((s) => s.moduleId)).toEqual([m2.id])

    const titles = allVisibleTitles(view)
    expect(titles).toContain('M2 material') // active module
    expect(titles).toContain('Program material') // COURSE (whole-program) stays
    expect(titles).toContain('Group material') // GROUP stays
    expect(titles).not.toContain('M1 material') // non-active module hidden
  })

  it('two groups of the same course on different weekdays can show different active modules', async () => {
    // Same calendar, but a much later kickoff so only Modul 1 is in progress
    // for both groups — this asserts the per-group active module is honoured
    // (both groups resolve via getCurrentActiveModuleForGroup, not course-wide).
    const schoolYear = computeSchoolYear()
    const admin = await createAdmin()
    const studentMon = await createStudent()
    const studentTue = await createStudent()
    const course = await createCourse({ isCustom: false })
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

    await seedMaterial({ scope: 'MODULE', moduleId: m1.id, type: 'LINK', uploadedById: admin.id, title: 'M1 material' })

    mockSession({ id: studentMon.id, role: 'STUDENT' })
    const monView = await getEffectiveMaterialsForStudent(groupMon.id)
    mockSession({ id: studentTue.id, role: 'STUDENT' })
    const tueView = await getEffectiveMaterialsForStudent(groupTue.id)

    // Both groups are in Modul 1's window now → both see the Modul 1 material,
    // and each computes its own active module independently.
    expect(allVisibleTitles(monView)).toContain('M1 material')
    expect(allVisibleTitles(tueView)).toContain('M1 material')
    expect(monView.activeModuleId).toBe(m1.id)
    expect(tueView.activeModuleId).toBe(m1.id)
  })
})
