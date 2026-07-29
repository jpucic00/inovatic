import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createTeacher,
  createStudent,
  createCourse,
  createModule,
  createGroup,
  createEnrollment,
  createTeacherAssignment,
  createMaterial as seedMaterial,
} from './helpers/factory'

// The CRUD actions call revalidatePath on success; next/cache is a no-op
// outside a request scope, so stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { createMaterial, updateMaterial, deleteMaterial, setMaterialHidden } = await import(
  '@/actions/material/crud'
)
const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')

function linkInputGroup(scheduledGroupId: string, title = 'Grupa link') {
  return {
    scope: 'GROUP' as const,
    scheduledGroupId,
    title,
    type: 'LINK' as const,
    fileUrl: null,
    externalUrl: 'https://example.com/x',
    description: null,
    fileSize: null,
    mimeType: null,
    sortOrder: 0,
  }
}

describe('createMaterial — teacher is GROUP-only', () => {
  it('lets a teacher add a GROUP material to their own group', async () => {
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const group = await createGroup({ courseId: course.id })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await createMaterial(linkInputGroup(group.id))
    expect(res.success).toBe(true)

    const rows = await db.material.findMany({ where: { scheduledGroupId: group.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].uploadedById).toBe(teacher.id)
  })

  it('rejects a teacher creating a MODULE material', async () => {
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const courseModule = await createModule(course.id)
    const group = await createGroup({ courseId: course.id })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await createMaterial({
      scope: 'MODULE',
      moduleId: courseModule.id,
      title: 'Modul materijal',
      type: 'LINK',
      fileUrl: null,
      externalUrl: 'https://example.com/x',
      description: null,
      fileSize: null,
      mimeType: null,
      sortOrder: 0,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('samo na razini grupe')
  })

  it('rejects a teacher creating a COURSE (whole-program) material', async () => {
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const group = await createGroup({ courseId: course.id })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await createMaterial({
      scope: 'COURSE',
      courseId: course.id,
      title: 'Programski materijal',
      type: 'LINK',
      fileUrl: null,
      externalUrl: 'https://example.com/x',
      description: null,
      fileSize: null,
      mimeType: null,
      sortOrder: 0,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('samo na razini grupe')
  })

  it('rejects a teacher creating a GROUP material on a group they do not own', async () => {
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const group = await createGroup({ courseId: course.id })
    // teacher NOT assigned to this group
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await createMaterial(linkInputGroup(group.id))
    expect(res.success).toBe(false)
  })
})

describe('createMaterial — admin authority over the curriculum', () => {
  it('lets an admin add a MODULE material on a standard program', async () => {
    const admin = await createAdmin()
    const course = await createCourse({ kind: 'STANDARD' })
    const courseModule = await createModule(course.id)
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createMaterial({
      scope: 'MODULE',
      moduleId: courseModule.id,
      title: 'Modul materijal',
      type: 'LINK',
      fileUrl: null,
      externalUrl: 'https://example.com/x',
      description: null,
      fileSize: null,
      mimeType: null,
      sortOrder: 0,
    })
    expect(res.success).toBe(true)
  })

  it('lets an admin add a COURSE (whole-program) material on a STANDARD program', async () => {
    const admin = await createAdmin()
    const course = await createCourse({ kind: 'STANDARD' })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createMaterial({
      scope: 'COURSE',
      courseId: course.id,
      title: 'Za cijeli program',
      type: 'LINK',
      fileUrl: null,
      externalUrl: 'https://example.com/x',
      description: null,
      fileSize: null,
      mimeType: null,
      sortOrder: 0,
    })
    expect(res.success).toBe(true)
    const rows = await db.material.findMany({ where: { courseId: course.id, scope: 'COURSE' } })
    expect(rows).toHaveLength(1)
  })

  it('accepts a ROBOCAMP material with an elearning.robocamp.eu URL', async () => {
    const admin = await createAdmin()
    const course = await createCourse({ kind: 'STANDARD' })
    const courseModule = await createModule(course.id)
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createMaterial({
      scope: 'MODULE',
      moduleId: courseModule.id,
      title: 'RoboCamp vodič',
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://elearning.robocamp.eu/course/42',
      description: null,
      fileSize: null,
      mimeType: null,
      sortOrder: 0,
    })
    expect(res.success).toBe(true)
    const row = await db.material.findFirst({ where: { moduleId: courseModule.id } })
    expect(row?.type).toBe('ROBOCAMP')
  })
})

describe('updateMaterial / deleteMaterial — teacher ownership', () => {
  it('lets a teacher edit their own GROUP material', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const mat = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      uploadedById: teacher.id,
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await updateMaterial({ id: mat.id, title: 'Novi naslov' })
    expect(res.success).toBe(true)
    const updated = await db.material.findUnique({ where: { id: mat.id } })
    expect(updated?.title).toBe('Novi naslov')
  })

  it('blocks a teacher from editing a GROUP material uploaded by someone else', async () => {
    const teacher = await createTeacher()
    const other = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const mat = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      uploadedById: other.id,
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await updateMaterial({ id: mat.id, title: 'Hack' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('sami dodali')
  })

  it('blocks a teacher from deleting an admin MODULE (curriculum) material', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const courseModule = await createModule(course.id)
    const group = await createGroup({ courseId: course.id })
    await createTeacherAssignment(teacher.id, group.id)
    const mat = await seedMaterial({
      scope: 'MODULE',
      moduleId: courseModule.id,
      uploadedById: admin.id,
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await deleteMaterial(mat.id)
    expect(res.success).toBe(false)
    const stillThere = await db.material.findUnique({ where: { id: mat.id } })
    expect(stillThere).not.toBeNull()
  })

  it('lets an admin delete a teacher-uploaded GROUP material', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    const group = await createGroup()
    const mat = await seedMaterial({
      scope: 'GROUP',
      scheduledGroupId: group.id,
      uploadedById: teacher.id,
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await deleteMaterial(mat.id)
    expect(res.success).toBe(true)
    const gone = await db.material.findUnique({ where: { id: mat.id } })
    expect(gone).toBeNull()
  })
})

describe('COURSE-on-standard visibility, propagation and per-group hide', () => {
  it('shows a whole-program material in every group and respects per-group hide', async () => {
    const admin = await createAdmin()
    const student = await createStudent()
    const course = await createCourse({ kind: 'STANDARD' })
    await createModule(course.id)
    const groupA = await createGroup({ courseId: course.id })
    const groupB = await createGroup({ courseId: course.id })
    await createEnrollment(student.id, groupA.id)
    await createEnrollment(student.id, groupB.id)

    const mat = await seedMaterial({
      scope: 'COURSE',
      courseId: course.id,
      type: 'LINK',
      uploadedById: admin.id,
    })

    mockSession({ id: student.id, role: 'STUDENT' })
    const viewA1 = await getEffectiveMaterialsForStudent(groupA.id)
    const viewB1 = await getEffectiveMaterialsForStudent(groupB.id)
    expect(viewA1.programMaterials.links.some((m) => m.id === mat.id)).toBe(true)
    expect(viewB1.programMaterials.links.some((m) => m.id === mat.id)).toBe(true)

    // Hide it in group A only.
    mockSession({ id: admin.id, role: 'ADMIN' })
    const hideRes = await setMaterialHidden(mat.id, groupA.id, true)
    expect(hideRes.success).toBe(true)

    mockSession({ id: student.id, role: 'STUDENT' })
    const viewA2 = await getEffectiveMaterialsForStudent(groupA.id)
    const viewB2 = await getEffectiveMaterialsForStudent(groupB.id)
    expect(viewA2.programMaterials.links.some((m) => m.id === mat.id)).toBe(false)
    expect(viewB2.programMaterials.links.some((m) => m.id === mat.id)).toBe(true)
  })
})
