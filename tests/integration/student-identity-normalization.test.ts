/**
 * Account creation normalizes the child's name and tolerates the differences
 * that once split one child into two accounts (2026-09-06: a second upit whose
 * name carried a trailing space). The inquiry itself is never touched — the
 * matching and the trimming happen when the admin clicks "Kreiraj račun".
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

const { createStudentFromInquiry, createStudentManually, updateStudent } = await import(
  '@/actions/admin/student'
)
const { getReturningStudentInfo } = await import('@/actions/admin/inquiry')

let seq = 0
const uniq = () => `${Date.now().toString(36)}${(++seq).toString(36)}`

async function adminSession() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
}

async function groupInSplit() {
  const course = await createCourse()
  return createGroup({ courseId: course.id, city: 'SPLIT' })
}

async function acceptInquiry(overrides: {
  childFirstName: string
  childLastName: string
  childDateOfBirth: string
  parentEmail?: string
}) {
  const group = await groupInSplit()
  const inquiry = await createInquiry({ ...overrides, city: 'SPLIT', courseId: group.courseId })
  const result = await createStudentFromInquiry(inquiry.id, group.id)
  expect(result.success).toBe(true)
  if (!result.success) throw new Error('unreachable')
  return result
}

describe('createStudentFromInquiry — one child, one account', () => {
  it('reuses the account for "Anic " (trailing space, no diacritic) and renames it to the upit spelling', async () => {
    await adminSession()
    const dob = '2018-03-03'
    const tag = uniq()
    const stored = await createStudent({
      firstName: 'Ana',
      lastName: `Anić${tag}`,
      dateOfBirth: dob,
      city: 'SPLIT',
    })

    const result = await acceptInquiry({
      childFirstName: 'Ana ',
      childLastName: `Anic${tag} `,
      childDateOfBirth: dob,
    })
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(stored.id)

    const accounts = await db.user.findMany({ where: { role: 'STUDENT', dateOfBirth: dob, lastName: { contains: tag } } })
    expect(accounts).toHaveLength(1)
    // The newer spelling wins, and it is stored trimmed.
    expect(accounts[0].firstName).toBe('Ana')
    expect(accounts[0].lastName).toBe(`Anic${tag}`)
  })

  it('reuses the account in the reverse direction — "Anić" arriving for a stored "Anic"', async () => {
    await adminSession()
    const dob = '2018-04-04'
    const tag = uniq()
    const stored = await createStudent({
      firstName: 'Ana',
      lastName: `Anic${tag}`,
      dateOfBirth: dob,
      city: 'SPLIT',
    })

    const result = await acceptInquiry({
      childFirstName: 'Ana',
      childLastName: `Anić${tag}`,
      childDateOfBirth: dob,
    })
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(stored.id)

    const healed = await db.user.findUnique({ where: { id: stored.id } })
    expect(healed?.lastName).toBe(`Anić${tag}`)
  })

  it('matches a decomposed (NFD) spelling and stores the composed (NFC) form', async () => {
    await adminSession()
    const dob = '2018-05-05'
    const tag = uniq()
    const stored = await createStudent({
      firstName: 'Ana',
      lastName: `Anić${tag}`,
      dateOfBirth: dob,
      city: 'SPLIT',
    })

    const result = await acceptInquiry({
      childFirstName: 'Ana',
      childLastName: `Anic\u0301${tag}`,
      childDateOfBirth: dob,
    })
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(stored.id)

    const healed = await db.user.findUnique({ where: { id: stored.id } })
    expect(healed?.lastName).toBe(`Anić${tag}`)
    expect(healed?.lastName).toBe(healed?.lastName.normalize('NFC'))
  })

  it('leaves the inquiry row exactly as the parent typed it', async () => {
    await adminSession()
    const group = await groupInSplit()
    const inquiry = await createInquiry({
      childFirstName: 'Ana ',
      childLastName: `Anic${uniq()} `,
      childDateOfBirth: '2018-06-06',
      city: 'SPLIT',
      courseId: group.courseId,
    })
    const result = await createStudentFromInquiry(inquiry.id, group.id)
    expect(result.success).toBe(true)

    const after = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(after?.childFirstName).toBe('Ana ')
    expect(after?.childLastName).toBe(inquiry.childLastName)
  })

  it('persists a NEW account trimmed, single-spaced, with a trimmed parent e-mail', async () => {
    await adminSession()
    const tag = uniq()
    const result = await acceptInquiry({
      childFirstName: '  Ana   Marija ',
      childLastName: ` Novi${tag} `,
      childDateOfBirth: '2018-07-07',
      parentEmail: ` roditelj.${tag}@example.com `,
    })
    expect(result.isExisting).toBe(false)

    const created = await db.user.findUnique({ where: { id: result.studentId } })
    expect(created?.firstName).toBe('Ana Marija')
    expect(created?.lastName).toBe(`Novi${tag}`)
    expect(created?.parentEmail).toBe(`roditelj.${tag}@example.com`)
  })

  it('still treats a different date of birth as a different child', async () => {
    await adminSession()
    const tag = uniq()
    const stored = await createStudent({
      firstName: 'Ana',
      lastName: `Anić${tag}`,
      dateOfBirth: '2018-08-08',
      city: 'SPLIT',
    })
    const result = await acceptInquiry({
      childFirstName: 'Ana',
      childLastName: `Anić${tag}`,
      childDateOfBirth: '2016-08-08',
    })
    expect(result.isExisting).toBe(false)
    expect(result.studentId).not.toBe(stored.id)
  })
})

describe('legacy tier (DOB-less imported account) with the same tolerance', () => {
  it('matches "Coric" + shouty spaced e-mail against a stored "Ćorić", heals the DOB and renames', async () => {
    await adminSession()
    const tag = uniq()
    const parentEmail = `roditelj.${tag}@example.com`
    const stored = await createStudent({
      firstName: 'Legonja',
      lastName: `Ćorić${tag}`,
      dateOfBirth: null,
      parentEmail,
      city: 'SPLIT',
    })

    const result = await acceptInquiry({
      childFirstName: 'Legonja',
      childLastName: `Coric${tag} `,
      childDateOfBirth: '2016-09-09',
      parentEmail: ` ${parentEmail.toUpperCase()} `,
    })
    expect(result.isExisting).toBe(true)
    expect(result.studentId).toBe(stored.id)

    const healed = await db.user.findUnique({ where: { id: stored.id } })
    expect(healed?.dateOfBirth).toBe('2016-09-09')
    expect(healed?.lastName).toBe(`Coric${tag}`)
    expect(healed?.parentEmail).toBe(parentEmail.toUpperCase())
  })
})

describe('the rest of the app sees the same match', () => {
  it('flags "Anic " as Ponovni upis when "Anić" has an account', async () => {
    const dob = '2018-10-10'
    const tag = uniq()
    await createStudent({ firstName: 'Ana', lastName: `Anić${tag}`, dateOfBirth: dob, city: 'SPLIT' })

    const [row] = await flagReturningInquiries([
      {
        childFirstName: 'Ana ',
        childLastName: `Anic${tag} `,
        childDateOfBirth: dob,
        parentEmail: `unrelated.${tag}@example.com`,
        studentId: null,
        city: 'SPLIT' as const,
      },
    ])
    expect(row.isReturning).toBe(true)
  })

  it('surfaces the account in the create dialog for the spaced spelling', async () => {
    await adminSession()
    const dob = '2018-11-11'
    const tag = uniq()
    const stored = await createStudent({
      firstName: 'Ana',
      lastName: `Anić${tag}`,
      dateOfBirth: dob,
      city: 'SPLIT',
    })
    const info = await getReturningStudentInfo({
      firstName: 'ana ',
      lastName: `ANIC${tag} `,
      dateOfBirth: dob,
    })
    expect(info?.id).toBe(stored.id)
  })

  it('manual creation and edit both persist the normalized name', async () => {
    await adminSession()
    const tag = uniq()
    const created = await createStudentManually({
      firstName: ' Ana ',
      lastName: `  Rucni${tag}  `,
      dateOfBirth: '2018-12-12',
      parentEmail: `roditelj.${tag}@example.com`,
    })
    expect(created.success).toBe(true)
    if (!created.success) throw new Error('unreachable')
    const row = await db.user.findUnique({ where: { id: created.studentId } })
    expect(row?.firstName).toBe('Ana')
    expect(row?.lastName).toBe(`Rucni${tag}`)

    const edited = await updateStudent({
      id: created.studentId,
      firstName: 'Ana  Marija ',
      lastName: `Rucni${tag}`,
      dateOfBirth: '2018-12-12',
      parentEmail: `roditelj.${tag}@example.com`,
    })
    expect(edited.success).toBe(true)
    const after = await db.user.findUnique({ where: { id: created.studentId } })
    expect(after?.firstName).toBe('Ana Marija')
  })
})
