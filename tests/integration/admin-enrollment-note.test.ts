/**
 * The admin's note on an enrollment: the write, its guards, and the fact that a
 * teacher never sees it.
 */
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { buildStudentDetailForAdmin, buildStudentDetailForTeacher } from '@/lib/student-detail'
import { ENROLLMENT_NOTE_MAX_LENGTH } from '@/lib/validators/admin/payment'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setEnrollmentAdminNote } = await import('@/actions/admin/payment')

const CY = computeSchoolYear()

async function storedNote(enrollmentId: string) {
  const row = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { adminNote: true },
  })
  return row?.adminNote ?? null
}

async function seedEnrollment(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const student = await createStudent({ city })
  const course = await createCourse({ kind: 'STANDARD', city: null })
  const group = await createGroup({ courseId: course.id, city, schoolYear: CY })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: CY })
  return { student, enrollment }
}

describe('setEnrollmentAdminNote', () => {
  it('saves, edits and clears the note; blank and whitespace store NULL', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment()

    expect((await setEnrollmentAdminNote(enrollment.id, '  Plaća u dvije rate.\nUgovor kod mame.  ')).success).toBe(true)
    expect(await storedNote(enrollment.id)).toBe('Plaća u dvije rate.\nUgovor kod mame.')

    expect((await setEnrollmentAdminNote(enrollment.id, 'Druga rata uplaćena.')).success).toBe(true)
    expect(await storedNote(enrollment.id)).toBe('Druga rata uplaćena.')

    expect((await setEnrollmentAdminNote(enrollment.id, '   ')).success).toBe(true)
    expect(await storedNote(enrollment.id)).toBeNull()

    await setEnrollmentAdminNote(enrollment.id, 'x')
    expect((await setEnrollmentAdminNote(enrollment.id, null)).success).toBe(true)
    expect(await storedNote(enrollment.id)).toBeNull()
  })

  it('refuses a note over the length limit and keeps the old one', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment()
    await setEnrollmentAdminNote(enrollment.id, 'stara')

    const res = await setEnrollmentAdminNote(enrollment.id, 'a'.repeat(ENROLLMENT_NOTE_MAX_LENGTH + 1))
    expect(res.success).toBe(false)
    expect(await storedNote(enrollment.id)).toBe('stara')
  })

  it('answers a cross-city enrollment exactly like a missing one', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SIBENIK')

    const res = await setEnrollmentAdminNote(enrollment.id, 'tuđe')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Upis nije pronađen.')
    expect(await storedNote(enrollment.id)).toBeNull()
  })

  it('is refused for a TEACHER session', async () => {
    const { enrollment } = await seedEnrollment()
    mockSession({ id: 'teacher-x', role: 'TEACHER', city: 'SPLIT' })

    await expect(setEnrollmentAdminNote(enrollment.id, 'nastavnik')).rejects.toThrow()
    expect(await storedNote(enrollment.id)).toBeNull()
  })
})

describe('student detail payload', () => {
  it('carries the note for an admin and scrubs it for a teacher', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { student, enrollment } = await seedEnrollment()
    await setEnrollmentAdminNote(enrollment.id, 'Duguje modul 2.')

    const adminRow = (await buildStudentDetailForAdmin(student.id, 'SPLIT'))?.enrollments.find(
      (e) => e.id === enrollment.id,
    )
    expect(adminRow?.adminNote).toBe('Duguje modul 2.')

    const teacherRow = (await buildStudentDetailForTeacher(student.id))?.enrollments.find(
      (e) => e.id === enrollment.id,
    )
    expect(teacherRow).toBeDefined()
    expect(teacherRow?.adminNote).toBeNull()
  })
})
