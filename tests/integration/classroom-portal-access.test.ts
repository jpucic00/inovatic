/**
 * What the shared classroom login may open in the portal: the materials of any
 * CURRENT-year group of its own city, and nothing else. The gate is
 * `assertPortalGroupAccess`, shared with the child's shell/materials reads;
 * gallery, evaluation and profile keep `requireStudent()` and must refuse it.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeSchoolYear, getNextSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  classroomAccount,
  createCourse,
  createGroup,
  createLocation,
  createMaterial,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const CY = computeSchoolYear()
const NEXT = getNextSchoolYear(CY)
const PAST = getPreviousSchoolYear(CY)

const { getStudentGroupShell } = await import('@/actions/student/group')
const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')
const { getGroupGalleryForStudent } = await import('@/actions/student/gallery')
const { getMyAssessmentForGroup } = await import('@/actions/student/assessment')
const { getMyProfile } = await import('@/actions/student/profile')
const { getClassroomPrograms, getClassroomGroups } = await import('@/actions/classroom')

async function expectNotFound(p: Promise<unknown>): Promise<void> {
  await expect(p).rejects.toMatchObject({
    digest: expect.stringMatching(/^NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)$/),
  })
}

async function asClassroom(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const row = await classroomAccount(city)
  mockSession({ id: row.id, role: 'CLASSROOM', city })
  return row
}

describe('shell + materials through the classroom login', () => {
  it('opens a current-year group of its city, with no enrollment anywhere', async () => {
    const course = await createCourse({ kind: 'STANDARD' })
    const group = await createGroup({ courseId: course.id, schoolYear: CY, city: 'SPLIT' })
    const material = await createMaterial({ scope: 'GROUP', scheduledGroupId: group.id, title: 'Učionica-vidi' })
    await asClassroom('SPLIT')

    const shell = await getStudentGroupShell(group.id)
    expect(shell.group.id).toBe(group.id)

    const view = await getEffectiveMaterialsForStudent(group.id)
    expect(view.groupMaterials.links.map((m) => m.id)).toContain(material.id)
  })

  it('404s on a group of the other city', async () => {
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    const group = await createGroup({ schoolYear: CY, city: 'SIBENIK', locationId: sibenikLocation.id })
    await asClassroom('SPLIT')
    await expectNotFound(getStudentGroupShell(group.id))
    await expectNotFound(getEffectiveMaterialsForStudent(group.id))
  })

  it('404s on a past-year and on a NEXT-year group — current year only', async () => {
    const past = await createGroup({ schoolYear: PAST, city: 'SPLIT' })
    const next = await createGroup({ schoolYear: NEXT, city: 'SPLIT' })
    await asClassroom('SPLIT')
    await expectNotFound(getStudentGroupShell(past.id))
    await expectNotFound(getStudentGroupShell(next.id))
  })
})

describe('what stays behind the child account', () => {
  it('gallery, evaluation and profile refuse the classroom login', async () => {
    const group = await createGroup({ schoolYear: CY, city: 'SPLIT' })
    await asClassroom('SPLIT')
    // requireStudent() redirects a non-student; the digest is NEXT_REDIRECT.
    await expect(getGroupGalleryForStudent(group.id)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    })
    await expect(getMyAssessmentForGroup(group.id)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    })
    await expect(getMyProfile()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    })
  })
})

describe('program → group lists', () => {
  it("lists only the city's current-year groups, grouped by program", async () => {
    const course = await createCourse({ kind: 'STANDARD' })
    const a = await createGroup({ courseId: course.id, schoolYear: CY, city: 'SPLIT', name: 'Uč-A' })
    const b = await createGroup({ courseId: course.id, schoolYear: CY, city: 'SPLIT', name: 'Uč-B' })
    await createGroup({ courseId: course.id, schoolYear: PAST, city: 'SPLIT', name: 'Uč-prošla' })
    await createGroup({ courseId: course.id, schoolYear: NEXT, city: 'SPLIT', name: 'Uč-sljedeća' })
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    await createGroup({ courseId: course.id, schoolYear: CY, city: 'SIBENIK', locationId: sibenikLocation.id, name: 'Uč-Šibenik' })
    await asClassroom('SPLIT')

    const programs = await getClassroomPrograms()
    const mine = programs.find((p) => p.course.id === course.id)
    expect(mine?.groupCount).toBe(2)

    const { course: found, groups } = await getClassroomGroups(course.id)
    expect(found?.id).toBe(course.id)
    expect(groups.map((g) => g.id).sort()).toEqual([a.id, b.id].sort())
    expect(groups.every((g) => typeof g.location.name === 'string')).toBe(true)
  })

  it('sends a child session back to its own dashboard', async () => {
    const student = await createStudent()
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })
    await expect(getClassroomPrograms()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    })
  })
})
