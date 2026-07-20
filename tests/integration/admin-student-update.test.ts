import { describe, expect, it, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createInquiry,
  createLocation,
  createStudent,
} from './helpers/factory'

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeAll(() => {
  // createStudentFromInquiry sends credentials via Resend when RESEND_API_KEY
  // is present; clear it so the reuse test skips the send path entirely.
  delete process.env.RESEND_API_KEY
})

const { updateStudent, createStudentFromInquiry } = await import(
  '@/actions/admin/student'
)

let seq = 0
const uniqueName = () => `Upd${Date.now().toString(36)}${(++seq).toString(36)}`

describe('updateStudent — admin edit of child + parent data', () => {
  it('edits every child + parent field', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const student = await createStudent({
      city: 'SPLIT',
      firstName: 'Ana',
      lastName: uniqueName(),
      dateOfBirth: '2014-01-01',
    })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateStudent({
      id: student.id,
      firstName: 'Ana Marija',
      lastName: 'Novak',
      dateOfBirth: '2013-05-20',
      childSchool: 'OŠ Test',
      parentName: 'Ivo Novak',
      parentEmail: 'ivo@test.local',
      parentPhone: '+385998877',
    })

    expect(res.success).toBe(true)
    const updated = await db.user.findUnique({ where: { id: student.id } })
    expect(updated?.firstName).toBe('Ana Marija')
    expect(updated?.lastName).toBe('Novak')
    expect(updated?.dateOfBirth).toBe('2013-05-20')
    expect(updated?.childSchool).toBe('OŠ Test')
    expect(updated?.parentName).toBe('Ivo Novak')
    expect(updated?.parentEmail).toBe('ivo@test.local')
    expect(updated?.parentPhone).toBe('+385998877')
  })

  it('clears optional fields when passed empty strings', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT', dateOfBirth: '2014-01-01' })
    await db.user.update({
      where: { id: student.id },
      data: {
        parentName: 'Stari',
        parentEmail: 'stari@test.local',
        parentPhone: '+385900000',
        childSchool: 'Stara škola',
      },
    })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateStudent({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: '2014-01-01',
      childSchool: '',
      parentName: '',
      parentEmail: '',
      parentPhone: '',
    })

    expect(res.success).toBe(true)
    const updated = await db.user.findUnique({ where: { id: student.id } })
    expect(updated?.childSchool).toBeNull()
    expect(updated?.parentName).toBeNull()
    expect(updated?.parentEmail).toBeNull()
    expect(updated?.parentPhone).toBeNull()
  })

  it('rejects invalid input (name too short) without writing', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const student = await createStudent({
      city: 'SPLIT',
      firstName: 'Petar',
      dateOfBirth: '2015-01-01',
    })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateStudent({
      id: student.id,
      firstName: 'A',
      lastName: student.lastName,
      dateOfBirth: '2015-01-01',
    })

    expect(res.success).toBe(false)
    const untouched = await db.user.findUnique({ where: { id: student.id } })
    expect(untouched?.firstName).toBe('Petar')
  })

  it('404s a cross-city student and leaves the row intact', async () => {
    const splitStudent = await createStudent({
      city: 'SPLIT',
      firstName: 'Pero',
      dateOfBirth: '2015-01-01',
    })
    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(
      updateStudent({
        id: splitStudent.id,
        firstName: 'Hakirano',
        lastName: 'Hakirano',
        dateOfBirth: '2000-01-01',
      }),
    ).rejects.toThrow()

    const stillThere = await db.user.findUnique({ where: { id: splitStudent.id } })
    expect(stillThere?.firstName).toBe('Pero')
    expect(stillThere?.dateOfBirth).toBe('2015-01-01')
  })
})

describe('createStudentFromInquiry — reuse updates the existing account with new inquiry data', () => {
  it('overwrites parent + school with the new inquiry values, keeps identity', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const dob = '2015-06-12'
    const marker = uniqueName()

    // Existing student carrying STALE parent data, matching the inquiry identity.
    const existing = await createStudent({
      city: 'SPLIT',
      firstName: 'Marko',
      lastName: marker,
      dateOfBirth: dob,
    })
    await db.user.update({
      where: { id: existing.id },
      data: {
        parentName: 'Stari Roditelj',
        parentEmail: 'stari@test.local',
        parentPhone: '+385900000',
        childSchool: 'Stara škola',
      },
    })

    // Radionica group → no module selection required to enroll.
    const location = await createLocation({ city: 'SPLIT' })
    const radionica = await createCourse({ isCustom: true })
    const group = await createGroup({
      courseId: radionica.id,
      locationId: location.id,
      city: 'SPLIT',
    })

    // Inquiry with the SAME child identity but NEW parent contact + school.
    const inquiry = await createInquiry({
      city: 'SPLIT',
      childFirstName: 'Marko',
      childLastName: marker,
      childDateOfBirth: dob,
      parentName: 'Novi Roditelj',
      parentEmail: 'novi@test.local',
      parentPhone: '+385911111',
      courseId: radionica.id,
      scheduledGroupId: group.id,
      schoolYear: group.schoolYear,
    })
    await db.inquiry.update({
      where: { id: inquiry.id },
      data: { childSchool: 'Nova škola' },
    })

    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const res = await createStudentFromInquiry(inquiry.id, group.id)

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.isExisting).toBe(true)
      expect(res.studentId).toBe(existing.id)
    }

    const updated = await db.user.findUnique({ where: { id: existing.id } })
    // New inquiry data won.
    expect(updated?.parentName).toBe('Novi Roditelj')
    expect(updated?.parentEmail).toBe('novi@test.local')
    expect(updated?.parentPhone).toBe('+385911111')
    expect(updated?.childSchool).toBe('Nova škola')
    // Identity (the match key) is never changed on reuse.
    expect(updated?.firstName).toBe('Marko')
    expect(updated?.lastName).toBe(marker)
    expect(updated?.dateOfBirth).toBe(dob)
  })
})
