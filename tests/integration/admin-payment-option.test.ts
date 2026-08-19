/**
 * "Način plaćanja" on an enrollment: the admin write, its guards, and the fact
 * that a teacher never sees it.
 *
 * The value is only ever meaningful on an SLR enrollment, so the interesting
 * assertions are the refusals — a radionica or a natjecateljski card must not be
 * able to hold one even though the column exists on every row.
 */
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { buildStudentDetailForTeacher } from '@/lib/student-detail'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
} from './helpers/factory'
import type { ProgramKind } from '@prisma/client'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setEnrollmentPaymentOption } = await import('@/actions/admin/payment')

const CY = computeSchoolYear()

async function storedOption(enrollmentId: string) {
  const row = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { paymentOption: true },
  })
  return row?.paymentOption ?? null
}

async function seedEnrollment(
  opts: { city?: 'SPLIT' | 'SIBENIK'; kind?: ProgramKind } = {},
) {
  const city = opts.city ?? 'SPLIT'
  const kind = opts.kind ?? 'STANDARD'
  const student = await createStudent({ city })
  const course = await createCourse({ kind, city: kind === 'RADIONICA' ? city : null })
  const group = await createGroup({ courseId: course.id, city, schoolYear: CY })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: CY })
  return { student, course, group, enrollment }
}

describe('setEnrollmentPaymentOption', () => {
  it('records a choice, changes it, and clears it again', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment()
    expect(await storedOption(enrollment.id)).toBeNull()

    expect((await setEnrollmentPaymentOption(enrollment.id, 'PO_MODULU')).success).toBe(true)
    expect(await storedOption(enrollment.id)).toBe('PO_MODULU')

    expect((await setEnrollmentPaymentOption(enrollment.id, 'CIJELA_GODINA')).success).toBe(true)
    expect(await storedOption(enrollment.id)).toBe('CIJELA_GODINA')

    // Clearing must actually clear — "nije odabrano" is a real third state, not
    // a validation failure that silently leaves the old answer standing.
    expect((await setEnrollmentPaymentOption(enrollment.id, null)).success).toBe(true)
    expect(await storedOption(enrollment.id)).toBeNull()
  })

  it('refuses a radionica enrollment — its plan is fixed', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment({ kind: 'RADIONICA' })
    const res = await setEnrollmentPaymentOption(enrollment.id, 'PO_MODULU')

    expect(res.success).toBe(false)
    expect(await storedOption(enrollment.id)).toBeNull()
  })

  it('refuses a natjecateljski enrollment — it is billed monthly', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment({ kind: 'COMPETITION' })
    const res = await setEnrollmentPaymentOption(enrollment.id, 'CIJELA_GODINA')

    expect(res.success).toBe(false)
    expect(await storedOption(enrollment.id)).toBeNull()
  })

  it('still lets a non-SLR enrollment be cleared', async () => {
    // Only WRITING a value is refused. Clearing must always work, or a row that
    // predates the guard (or a kind changed underneath it) could never be tidied.
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment({ kind: 'RADIONICA' })
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { paymentOption: 'PO_MODULU' },
    })

    expect((await setEnrollmentPaymentOption(enrollment.id, null)).success).toBe(true)
    expect(await storedOption(enrollment.id)).toBeNull()
  })

  it('answers a cross-city enrollment exactly like a missing one', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment({ city: 'SIBENIK' })
    const res = await setEnrollmentPaymentOption(enrollment.id, 'PO_MODULU')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Upis nije pronađen.')
    expect(await storedOption(enrollment.id)).toBeNull()
  })

  it('is refused for a TEACHER session', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment()

    mockSession({ id: 'teacher-x', role: 'TEACHER', city: 'SPLIT' })
    await expect(setEnrollmentPaymentOption(enrollment.id, 'PO_MODULU')).rejects.toThrow()
    expect(await storedOption(enrollment.id)).toBeNull()
  })
})

describe('teacher payload', () => {
  it('scrubs the payment option, like every paid mark', async () => {
    // How a family pays is a payment fact, so it follows the paid-mark scrub —
    // deliberately NOT the "Ugovor potpisan" exception, which teachers do see
    // because they collect the signed contracts at the group.
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { student, enrollment } = await seedEnrollment()
    await setEnrollmentPaymentOption(enrollment.id, 'CIJELA_GODINA')
    expect(await storedOption(enrollment.id)).toBe('CIJELA_GODINA')

    const detail = await buildStudentDetailForTeacher(student.id)
    const row = detail?.enrollments.find((e) => e.id === enrollment.id)

    expect(row).toBeDefined()
    expect(row?.paymentOption).toBeNull()
    expect(row?.fullYearPaidAt).toBeNull()
  })
})
