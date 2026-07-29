import { describe, expect, it, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import {
  createCourse,
  createEnrollmentWindow,
  createGroup,
  createLocation,
  createStudent,
  createEnrollment,
  relativeDateKey,
} from './helpers/factory'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import type { InquiryFormData } from '@/lib/validators/inquiry'

// submitInquiry emails on success when RESEND_API_KEY is set — keep the test
// environment offline.
beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const { submitInquiry } = await import('@/actions/inquiry')

const YEAR = '2026/2027'
let emailCounter = 0
const uniqueEmail = () => `termin-${Date.now().toString(36)}-${++emailCounter}@test.local`

function validForm(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2015-06-12',
    grade: GRADE_VALUES[0],
    consent: true,
    ...overrides,
  }
}

// A radionica (custom course) is the cheapest way to make getActivePrograms
// surface an open, non-full group without wiring the standard module arc —
// capacity for a custom course is just enrollments vs maxStudents.
async function openRadionicaWithGroup(maxStudents: number) {
  const course = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR })
  await createEnrollmentWindow(course.id, {
    schoolYear: YEAR,
    city: 'SPLIT',
    enrollmentStart: new Date('2020-01-01'),
    enrollmentEnd: new Date('2099-12-31'),
  })
  const location = await createLocation({ city: 'SPLIT' })
  const group = await createGroup({
    courseId: course.id,
    locationId: location.id,
    city: 'SPLIT',
    schoolYear: YEAR,
    maxStudents,
    // Ahead of today — a workshop that has already started is dropped from the
    // feed, which would make every termin here look non-existent.
    dateStart: relativeDateKey(30),
    dateEnd: relativeDateKey(35),
  })
  return { course, group }
}

describe('submitInquiry — termin required when an open group exists', () => {
  it('rejects a group-less inquiry whose course still has a free spot', async () => {
    const { course } = await openRadionicaWithGroup(2)
    const form = validForm({ courseId: course.id }) // radionica flow, no termin

    const res = await submitInquiry(form)

    expect(res.success).toBe(false)
    if (!res.success && 'code' in res) {
      expect(res.code).toBe('TERMIN_REQUIRED')
      expect(res.programs.some((p) => p.id === course.id)).toBe(true)
    } else {
      throw new Error('expected a TERMIN_REQUIRED result')
    }

    // Nothing was written.
    expect(await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })).toBeNull()
  })

  it('accepts the group-less inquiry once every group is full', async () => {
    const { course, group } = await openRadionicaWithGroup(1)
    // Fill the single spot so the course has no bookable termin.
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: YEAR })

    const form = validForm({ courseId: course.id })
    const res = await submitInquiry(form)

    expect(res.success).toBe(true)
    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.scheduledGroupId).toBeNull()
  })

  it('accepts a group-less inquiry when no enrolment window is open', async () => {
    // A course + group but NO enrollment window → getActivePrograms hides it.
    const course = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR })
    await createGroup({
      courseId: course.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      maxStudents: 5,
      // Upcoming, so the missing window is provably the only thing hiding it.
      dateStart: relativeDateKey(30),
      dateEnd: relativeDateKey(35),
    })

    const form = validForm({ courseId: course.id })
    const res = await submitInquiry(form)

    expect(res.success).toBe(true)
  })

  it('still accepts a general standard inquiry when no groups exist for the grade', async () => {
    // No standard groups seeded in the test DB → no availability for any grade.
    const form = validForm({ grade: '3' }) // SLR_2, nothing open
    const res = await submitInquiry(form)

    expect(res.success).toBe(true)
  })
})
