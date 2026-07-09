import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  createStudent,
  createCourse,
  createModule,
  createModuleSchedule,
  createGroup,
  createEnrollment,
  createModuleEnrollment,
} from './helpers/factory'
import { buildStudentDetailForAdmin, buildStudentDetailForTeacher } from '@/lib/student-detail'

// P4 fail-closed contract for the shared student-detail view builders:
// - passwordHash is NEVER selected (neither variant),
// - plainPassword IS retained (kids' passwords are shown to teachers by design),
// - payment fields (Enrollment.fullYearPaidAt, ModuleEnrollment.paidAt) appear
//   ONLY in the admin variant; the teacher variant hard-nulls them.
const YEAR_PAID_AT = new Date('2026-09-01T00:00:00.000Z')
const MODULE_PAID_AT = new Date('2026-09-15T00:00:00.000Z')

async function seedPaidStudent() {
  const student = await createStudent()
  await db.user.update({ where: { id: student.id }, data: { plainPassword: 'dijete-lozinka' } })
  const course = await createCourse()
  const mod = await createModule(course.id)
  const schedule = await createModuleSchedule(mod.id)
  const group = await createGroup({ courseId: course.id })
  const enrollment = await createEnrollment(student.id, group.id, { fullYearPaidAt: YEAR_PAID_AT })
  await createModuleEnrollment(enrollment.id, schedule.id, { paidAt: MODULE_PAID_AT })
  return student.id
}

describe('student-detail payload scope (P4)', () => {
  it('teacher payload keeps plainPassword, omits passwordHash, and nulls payment fields', async () => {
    const studentId = await seedPaidStudent()

    const detail = await buildStudentDetailForTeacher(studentId)

    expect(detail).not.toBeNull()
    expect(detail?.plainPassword).toBe('dijete-lozinka')
    // passwordHash was never selected → the key is absent from the payload.
    expect(detail !== null && 'passwordHash' in detail).toBe(false)
    for (const e of detail!.enrollments) {
      expect(e.fullYearPaidAt).toBeNull()
      for (const me of e.moduleEnrollments) {
        expect(me.paidAt).toBeNull()
      }
    }
  })

  it('admin payload retains the real payment fields', async () => {
    const studentId = await seedPaidStudent()

    const detail = await buildStudentDetailForAdmin(studentId)

    expect(detail).not.toBeNull()
    const enr = detail!.enrollments[0]
    expect(enr?.fullYearPaidAt).toEqual(YEAR_PAID_AT)
    expect(enr?.moduleEnrollments[0]?.paidAt).toEqual(MODULE_PAID_AT)
    // passwordHash is omitted from the admin payload too.
    expect(detail !== null && 'passwordHash' in detail).toBe(false)
  })
})
