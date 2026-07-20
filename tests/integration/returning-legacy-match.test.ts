/**
 * Legacy (DOB-less) returning-student matching — the fallback tier added for
 * the historical-workbook import, whose 107 students have no date of birth:
 * child name + parent email matches them, account reuse backfills the DOB, and
 * the healed account immediately leaves the fuzzy pool.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { flagReturningInquiries } from '@/lib/returning-inquiry'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createInquiry,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined })),
}))

beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const { createStudentFromInquiry, createStudentManually } = await import(
  '@/actions/admin/student'
)
const { getReturningStudentInfo } = await import('@/actions/admin/inquiry')

let seq = 0
const uniq = () => `${Date.now().toString(36)}${(++seq).toString(36)}`

/** Imported-style student: no DOB, no usable password, parent email on file. */
async function createLegacyStudent(overrides: { city?: 'SPLIT' | 'SIBENIK' } = {}) {
  const lastName = `Uvozni${uniq()}`
  const parentEmail = `roditelj.${uniq()}@example.com`
  const student = await createStudent({
    firstName: 'Legonja',
    lastName,
    city: overrides.city ?? 'SPLIT',
  })
  await db.user.update({
    where: { id: student.id },
    data: { parentEmail, plainPassword: null },
  })
  return { student, lastName, parentEmail }
}

function inquiryRow(overrides: {
  childFirstName?: string | null
  childLastName?: string | null
  childDateOfBirth?: string | null
  parentEmail: string
  city?: 'SPLIT' | 'SIBENIK'
}) {
  return {
    childFirstName: overrides.childFirstName === undefined ? 'Legonja' : overrides.childFirstName,
    childLastName: overrides.childLastName === undefined ? null : overrides.childLastName,
    childDateOfBirth: overrides.childDateOfBirth ?? '2016-05-05',
    parentEmail: overrides.parentEmail,
    studentId: null,
    city: overrides.city ?? ('SPLIT' as const),
  }
}

describe('flagReturningInquiries — legacy tier', () => {
  it('flags a DOB-less student by name + parent email, case-insensitively', async () => {
    const { lastName, parentEmail } = await createLegacyStudent()
    const [hit, wrongEmail, wrongName] = await flagReturningInquiries([
      inquiryRow({ childLastName: lastName, parentEmail: parentEmail.toUpperCase() }),
      inquiryRow({ childLastName: lastName, parentEmail: `other.${uniq()}@example.com` }),
      inquiryRow({ childFirstName: 'Sestra', childLastName: lastName, parentEmail }),
    ])

    expect(hit.isReturning).toBe(true)
    // Same parent email but a different child (a sibling) must not match.
    expect(wrongEmail.isReturning).toBe(false)
    expect(wrongEmail.isReturningOtherCity).toBe(false)
    expect(wrongName.isReturning).toBe(false)
  })

  it('masks a legacy match from the other city instead of revealing it', async () => {
    const { lastName, parentEmail } = await createLegacyStudent({ city: 'SPLIT' })
    const [row] = await flagReturningInquiries([
      inquiryRow({ childLastName: lastName, parentEmail, city: 'SIBENIK' }),
    ])
    expect(row.isReturning).toBe(false)
    expect(row.isReturningOtherCity).toBe(true)
  })

  it('never matches by email alone when the row has no child name (PARTY)', async () => {
    const { parentEmail } = await createLegacyStudent()
    const [row] = await flagReturningInquiries([
      inquiryRow({ childFirstName: null, childLastName: null, childDateOfBirth: null, parentEmail }),
    ])
    expect(row.isReturning).toBe(false)
    expect(row.isReturningOtherCity).toBe(false)
  })

  it('keeps the strict name+DOB tier working independently of email', async () => {
    const lastName = `Strogi${uniq()}`
    await createStudent({ firstName: 'Dob', lastName, dateOfBirth: '2015-01-01', city: 'SPLIT' })
    const [row] = await flagReturningInquiries([
      inquiryRow({
        childFirstName: 'Dob',
        childLastName: lastName,
        childDateOfBirth: '2015-01-01',
        parentEmail: `unrelated.${uniq()}@example.com`,
      }),
    ])
    expect(row.isReturning).toBe(true)
  })
})

describe('getReturningStudentInfo — legacy tier', () => {
  it('surfaces a DOB-less student for the create dialog via parent email', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { student, lastName, parentEmail } = await createLegacyStudent()

    const info = await getReturningStudentInfo({
      firstName: 'Legonja',
      lastName,
      dateOfBirth: '2016-05-05',
      parentEmail,
    })
    expect(info?.id).toBe(student.id)

    // Without the email the DOB-less account is invisible, as before.
    const withoutEmail = await getReturningStudentInfo({
      firstName: 'Legonja',
      lastName,
      dateOfBirth: '2016-05-05',
    })
    expect(withoutEmail).toBeNull()
  })
})

describe('createStudentFromInquiry — legacy reuse heals the DOB', () => {
  it('reuses the imported account, backfills the DOB, and closes the fuzzy window', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const course = await createCourse()
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    const { student, lastName, parentEmail } = await createLegacyStudent()

    const inquiry = await createInquiry({
      childFirstName: 'Legonja',
      childLastName: lastName,
      childDateOfBirth: '2016-09-09',
      parentEmail: parentEmail.toUpperCase(),
      city: 'SPLIT',
      courseId: course.id,
    })

    const result = await createStudentFromInquiry(inquiry.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(student.id)

    // No duplicate account; the DOB is healed onto the imported row.
    const accounts = await db.user.findMany({
      where: { role: 'STUDENT', firstName: 'Legonja', lastName },
    })
    expect(accounts).toHaveLength(1)
    expect(accounts[0].dateOfBirth).toBe('2016-09-09')

    const enrollment = await db.enrollment.findFirst({
      where: { userId: student.id, scheduledGroupId: group.id },
    })
    expect(enrollment).not.toBeNull()

    // Healed account has a DOB now → the legacy tier no longer applies, so a
    // same-name inquiry with a DIFFERENT DOB is a new child, not a match.
    const differentChild = await getReturningStudentInfo({
      firstName: 'Legonja',
      lastName,
      dateOfBirth: '2010-01-01',
      parentEmail,
    })
    expect(differentChild).toBeNull()
  })

  it('applies identically to manual creation (Dodaj učenika, no inquiry)', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { student, lastName, parentEmail } = await createLegacyStudent()

    const result = await createStudentManually({
      firstName: 'Legonja',
      lastName,
      dateOfBirth: '2016-11-11',
      parentEmail: parentEmail.toUpperCase(),
    })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(student.id)

    const healed = await db.user.findUnique({ where: { id: student.id } })
    expect(healed?.dateOfBirth).toBe('2016-11-11')
  })

  it('blocks cross-city legacy reuse with the standard escalation error', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const course = await createCourse()
    const group = await createGroup({ courseId: course.id, city: 'SIBENIK' })
    const { lastName, parentEmail } = await createLegacyStudent({ city: 'SPLIT' })

    const inquiry = await createInquiry({
      childFirstName: 'Legonja',
      childLastName: lastName,
      childDateOfBirth: '2016-09-09',
      parentEmail,
      city: 'SIBENIK',
      courseId: course.id,
    })

    const result = await createStudentFromInquiry(inquiry.id, group.id)
    expect(result.success).toBe(false)
  })
})
