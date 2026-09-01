import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createMaterial as seedMaterial,
  createModule,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getGroupGuidesForStaff } = await import('@/actions/teacher/materials')

/**
 * The presenter's feed. What a teacher puts on the classroom wall has to be
 * what their group actually has — so this is the group's EFFECTIVE view, with
 * per-group hides applied, not the staff management list.
 */
describe('getGroupGuidesForStaff', () => {
  it('drops a guide hidden in this group', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'RADIONICA', city: 'SPLIT' })
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    await createTeacherAssignment(teacher.id, group.id)

    const visible = await seedMaterial({
      scope: 'COURSE',
      courseId: course.id,
      title: 'Vodič koji se prikazuje',
      type: 'ROBOCAMP',
      externalUrl: 'https://elearning.robocamp.eu/course/1',
      uploadedById: admin.id,
    })
    const hidden = await seedMaterial({
      scope: 'COURSE',
      courseId: course.id,
      title: 'Vodič sakriven u grupi',
      type: 'ROBOCAMP',
      externalUrl: 'https://elearning.robocamp.eu/course/2',
      uploadedById: admin.id,
    })
    await db.materialGroupHide.create({
      data: { materialId: hidden.id, scheduledGroupId: group.id },
    })

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const feed = await getGroupGuidesForStaff(group.id)

    expect(feed.guides.map((g) => g.id)).toEqual([visible.id])
  })

  it('includes a guide attached to the whole programme, not only to a module', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'RADIONICA', city: 'SPLIT' })
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    await createTeacherAssignment(teacher.id, group.id)

    await seedMaterial({
      scope: 'COURSE',
      courseId: course.id,
      title: 'Programski vodič',
      type: 'ROBOCAMP',
      externalUrl: 'https://elearning.robocamp.eu/course/3',
      uploadedById: admin.id,
    })

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const feed = await getGroupGuidesForStaff(group.id)

    expect(feed.guides.map((g) => g.title)).toEqual(['Programski vodič'])
  })

  it('treats an un-backfilled LINK row with a RoboCamp URL as a guide', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'RADIONICA', city: 'SPLIT' })
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    await createTeacherAssignment(teacher.id, group.id)

    await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      title: 'Stari redak',
      type: 'LINK',
      externalUrl: 'https://elearning.robocamp.eu/course/4',
      uploadedById: admin.id,
    })
    await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      title: 'Obična poveznica',
      type: 'LINK',
      externalUrl: 'https://scratch.mit.edu',
      uploadedById: admin.id,
    })

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const feed = await getGroupGuidesForStaff(group.id)

    expect(feed.guides.map((g) => g.title)).toEqual(['Stari redak'])
  })

  it('returns nothing for a group with no guide, so no button is offered', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'STANDARD', city: null })
    const mod = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    await createTeacherAssignment(teacher.id, group.id)
    await seedMaterial({
      scope: 'MODULE',
      moduleId: mod.id,
      title: 'Samo dokument',
      type: 'DOCUMENT',
      uploadedById: admin.id,
    })

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const feed = await getGroupGuidesForStaff(group.id)

    expect(feed.guides).toEqual([])
  })

  it("404s for a same-city teacher not assigned to the group", async () => {
    // This feed is the ONLY guard in front of /nastavnik/prezentacija/[groupId]
    // — the presenter page has no gate of its own, so this refusal is what
    // keeps a colleague's lesson material off someone else's wall.
    const owner = await createTeacher({ city: 'SPLIT' })
    const outsider = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'RADIONICA', city: 'SPLIT' })
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    await createTeacherAssignment(owner.id, group.id)

    mockSession({ id: outsider.id, role: 'TEACHER', city: 'SPLIT' })

    await expect(getGroupGuidesForStaff(group.id)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)$/),
    })
  })
})
