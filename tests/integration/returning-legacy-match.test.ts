/**
 * Legacy (DOB-less) returning-student matching — the fallback tier added for
 * the historical-workbook import, whose 107 students have no date of birth:
 * child name + parent email matches them, account reuse backfills the DOB, and
 * the healed account immediately leaves the fuzzy pool.
 */
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { flagReturningInquiries } from '@/lib/returning-inquiry'
import { candidateWheres } from '@/lib/student-match'
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
async function createLegacyStudent(
  overrides: { city?: 'SPLIT' | 'SIBENIK'; parentEmail?: string } = {},
) {
  const lastName = `Uvozni${uniq()}`
  const parentEmail = overrides.parentEmail ?? `roditelj.${uniq()}@example.com`
  const student = await createStudent({
    firstName: 'Legonja',
    lastName,
    city: overrides.city ?? 'SPLIT',
  })
  await db.user.update({
    where: { id: student.id },
    data: { parentEmail },
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

  it('reuses the imported account and links it to the parent login — no password is minted', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const course = await createCourse()
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    const { student, lastName, parentEmail } = await createLegacyStudent()

    const inquiry = await createInquiry({
      childFirstName: 'Legonja',
      childLastName: lastName,
      childDateOfBirth: '2016-09-09',
      parentEmail,
      city: 'SPLIT',
      courseId: course.id,
    })

    const result = await createStudentFromInquiry(inquiry.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')

    // Since 2026-09-29 a child never signs in: the reused row keeps its
    // unusable hash untouched and gains the parent login instead.
    expect(result.studentId).toBe(student.id)
    const healed = await db.user.findUnique({
      where: { id: student.id },
      select: { passwordHash: true, plainPassword: true, parentAccount: { select: { email: true } } },
    })
    expect(healed?.passwordHash).toBe(student.passwordHash)
    expect(healed?.plainPassword).toBeNull()
    expect(healed?.parentAccount?.email).toBe(parentEmail.toLowerCase())
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

describe('legacy tier — parent e-mail is compared whole, not as an ILIKE pattern', () => {
  // Prisma's insensitive `equals` is an unescaped ILIKE, so `_` in the upit's
  // address matches any one character in SQL. The candidate query may widen;
  // the in-memory key must still refuse another family's look-alike address.
  it('does not match ivanxhorvat@… from an upit sent by ivan_horvat@…', async () => {
    const stamp = uniq()
    const { student, lastName } = await createLegacyStudent({
      parentEmail: `ivanxhorvat.${stamp}@example.com`,
    })
    const upitEmail = `ivan_horvat.${stamp}@example.com`

    // Guard against a vacuous test: the SQL narrowing really does return the
    // other family's row, so only the in-memory decision keeps it out.
    const sqlCandidates = await db.user.findMany({
      where: {
        OR: candidateWheres({ firstName: 'Legonja', lastName, parentEmail: upitEmail }),
      },
      select: { id: true },
    })
    expect(sqlCandidates.map((c) => c.id)).toContain(student.id)

    const [row] = await flagReturningInquiries([
      inquiryRow({ childLastName: lastName, parentEmail: upitEmail }),
    ])
    expect(row.isReturning).toBe(false)
    expect(row.isReturningOtherCity).toBe(false)

    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const info = await getReturningStudentInfo({
      firstName: 'Legonja',
      lastName,
      dateOfBirth: '2016-05-05',
      parentEmail: upitEmail,
    })
    expect(info).toBeNull()

    const course = await createCourse()
    const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
    const inquiry = await createInquiry({
      childFirstName: 'Legonja',
      childLastName: lastName,
      childDateOfBirth: '2016-09-09',
      parentEmail: upitEmail,
      city: 'SPLIT',
      courseId: course.id,
    })
    const result = await createStudentFromInquiry(inquiry.id, group.id)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unreachable')
    expect(result.isExisting).toBe(false)
    expect(result.studentId).not.toBe(student.id)

    // The other family's account is untouched: no DOB healed onto it.
    const untouched = await db.user.findUnique({ where: { id: student.id } })
    expect(untouched?.dateOfBirth).toBeNull()
    expect(untouched?.parentEmail).toBe(`ivanxhorvat.${stamp}@example.com`)
  })
})
