/**
 * The family login (2026-09-29): one parent account per e-mail, strictly one
 * account per child, and a newer upit from the other parent MOVES the child —
 * but only with the admin's explicit yes. These tests hold the two properties
 * that matter: nothing changes who sees a child without that yes, and a refused
 * or unconfirmed link writes nothing at all.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  classroomAccount,
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createInquiry,
  createParent,
  createStudent,
  createTeacher,
  linkToParent,
} from './helpers/factory'
import { applyChildSelection, isSelectableChild } from '@/lib/portal-children'

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

let seq = 0
const uniq = () => `${Date.now().toString(36)}${(++seq).toString(36)}`
const email = (tag: string) => `${tag}.${uniq()}@example.com`

async function asAdmin(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

async function radionicaGroup(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const course = await createCourse({ kind: 'RADIONICA', city })
  return createGroup({ courseId: course.id, city })
}

function manualChild(parentEmail: string, over: { firstName?: string; dateOfBirth?: string } = {}) {
  return {
    firstName: over.firstName ?? 'Ana',
    lastName: `Obitelj${uniq()}`,
    dateOfBirth: over.dateOfBirth ?? '2016-03-03',
    parentName: 'Ivana Obitelj',
    parentEmail,
  }
}

async function linkOf(studentId: string) {
  const row = await db.user.findUniqueOrThrow({
    where: { id: studentId },
    select: { parentAccount: { select: { id: true, email: true, role: true } } },
  })
  return row.parentAccount
}

describe('creating an account links the child to its parent e-mail', () => {
  it('creates a PARENT account for a new address and links the child', async () => {
    await asAdmin()
    const parentEmail = email('nova')
    const res = await createStudentManually(manualChild(parentEmail))
    expect(res.success).toBe(true)
    if (!res.success) return

    const link = await linkOf(res.studentId)
    expect(link).toMatchObject({ email: parentEmail, role: 'PARENT' })
  })

  it('stores the address lower-cased and matches it case-insensitively', async () => {
    await asAdmin()
    const parentEmail = email('Velika')
    const res = await createStudentManually(manualChild(parentEmail))
    if (!res.success) throw new Error(res.error)
    expect((await linkOf(res.studentId))?.email).toBe(parentEmail.toLowerCase())
  })

  it('"_" in the address is not a wildcard: a look-alike family account is never joined', async () => {
    await asAdmin()
    const stamp = uniq()
    // Another family's account that an unescaped ILIKE `ivan_horvat` would match.
    const lookAlike = await createStudentManually(manualChild(`ivanxhorvat.${stamp}@example.com`))
    if (!lookAlike.success) throw new Error(lookAlike.error)
    const otherAccount = await linkOf(lookAlike.studentId)

    const parentEmail = `ivan_horvat.${stamp}@example.com`
    const res = await createStudentManually(manualChild(parentEmail))
    if (!res.success) throw new Error(res.error)

    const link = await linkOf(res.studentId)
    expect(link).toMatchObject({ email: parentEmail, role: 'PARENT' })
    expect(link?.id).not.toBe(otherAccount?.id)
  })

  it('asks before a sibling joins an account that already sees a child, then joins it', async () => {
    await asAdmin()
    const parentEmail = email('braca')
    const first = await createStudentManually(manualChild(parentEmail, { firstName: 'Ana' }))
    if (!first.success) throw new Error(first.error)

    const input = manualChild(parentEmail, { firstName: 'Marko', dateOfBirth: '2018-04-04' })
    const asked = await createStudentManually(input)
    expect(asked).toMatchObject({ success: false, code: 'PARENT_LINK_CONFIRM' })
    if (asked.success || !('parentLink' in asked)) throw new Error('expected a confirmation')
    expect(asked.parentLink.previousEmail).toBeNull()
    expect(asked.parentLink.otherChildren).toHaveLength(1)
    // Nothing was written while waiting for the yes.
    expect(await db.user.count({ where: { lastName: input.lastName } })).toBe(0)

    const confirmed = await createStudentManually({ ...input, confirmParentLink: true })
    if (!confirmed.success) throw new Error(confirmed.error)
    expect((await linkOf(confirmed.studentId))?.id).toBe((await linkOf(first.studentId))?.id)
    expect(await db.user.count({ where: { email: parentEmail.toLowerCase() } })).toBe(1)
  })

  it('names the address owner when it is a staff account', async () => {
    await asAdmin()
    const teacher = await createTeacher({ firstName: 'Iva', lastName: 'Nastavnica' })
    const asked = await createStudentManually(manualChild(teacher.email))
    if (asked.success || !('parentLink' in asked)) throw new Error('expected a confirmation')
    expect(asked.parentLink.staffName).toBe('Iva Nastavnica')

    const confirmed = await createStudentManually({ ...manualChild(teacher.email), confirmParentLink: true })
    if (!confirmed.success) throw new Error(confirmed.error)
    expect((await linkOf(confirmed.studentId))?.id).toBe(teacher.id)
  })

  it('refuses an address that belongs to a login that can never be a parent', async () => {
    await asAdmin()
    const classroom = await classroomAccount('SPLIT')
    const input = manualChild(classroom.email)
    const res = await createStudentManually({ ...input, confirmParentLink: true })
    expect(res.success).toBe(false)
    expect(await db.user.count({ where: { lastName: input.lastName } })).toBe(0)
  })

  it('counts, but never names, the account\'s children in the other city', async () => {
    const parent = await createParent({ city: 'SIBENIK' })
    const sibenikChild = await createStudent({ city: 'SIBENIK', firstName: 'Tajna' })
    await linkToParent(sibenikChild.id, parent.id)

    await asAdmin('SPLIT')
    const asked = await createStudentManually(manualChild(parent.email))
    if (asked.success || !('parentLink' in asked)) throw new Error('expected a confirmation')
    expect(asked.parentLink.otherChildren).toEqual([])
    expect(asked.parentLink.otherCityChildren).toBe(1)
    expect(JSON.stringify(asked.parentLink)).not.toContain('Tajna')
  })
})

describe('the other parent signs a returning child up', () => {
  it('moves the child only after the admin confirms, and says from where', async () => {
    await asAdmin()
    const mother = email('majka')
    const father = email('otac')
    const created = await createStudentManually(manualChild(mother))
    if (!created.success) throw new Error(created.error)
    const child = await db.user.findUniqueOrThrow({ where: { id: created.studentId } })

    const group = await radionicaGroup()
    const inquiry = await createInquiry({
      childFirstName: child.firstName,
      childLastName: child.lastName,
      childDateOfBirth: child.dateOfBirth,
      parentEmail: father,
      scheduledGroupId: group.id,
    })

    const asked = await createStudentFromInquiry(inquiry.id, group.id)
    expect(asked).toMatchObject({ success: false, code: 'PARENT_LINK_CONFIRM' })
    if (asked.success || !('parentLink' in asked)) throw new Error('expected a confirmation')
    expect(asked.parentLink).toMatchObject({ previousEmail: mother, email: father })

    // Unconfirmed = untouched: still the mother's, upit still open, no enrollment.
    expect((await linkOf(child.id))?.email).toBe(mother)
    expect((await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).status).toBe('NEW')
    expect(await db.enrollment.count({ where: { userId: child.id, scheduledGroupId: group.id } })).toBe(0)

    const moved = await createStudentFromInquiry(inquiry.id, group.id, undefined, true)
    expect(moved.success).toBe(true)
    expect((await linkOf(child.id))?.email).toBe(father)
  })

  it('leaves the link alone when the same parent signs up again', async () => {
    await asAdmin()
    const parentEmail = email('isti')
    const created = await createStudentManually(manualChild(parentEmail))
    if (!created.success) throw new Error(created.error)
    const child = await db.user.findUniqueOrThrow({ where: { id: created.studentId } })

    const group = await radionicaGroup()
    const inquiry = await createInquiry({
      childFirstName: child.firstName,
      childLastName: child.lastName,
      childDateOfBirth: child.dateOfBirth,
      parentEmail: parentEmail.toUpperCase(),
      scheduledGroupId: group.id,
    })
    const res = await createStudentFromInquiry(inquiry.id, group.id)
    expect(res.success).toBe(true)
  })

  it('moves the child on an admin edit of the parent e-mail, behind the same yes', async () => {
    await asAdmin()
    const oldEmail = email('stari')
    const newEmail = email('novi')
    const created = await createStudentManually(manualChild(oldEmail))
    if (!created.success) throw new Error(created.error)
    const child = await db.user.findUniqueOrThrow({ where: { id: created.studentId } })
    const edit = {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      dateOfBirth: child.dateOfBirth!,
      parentEmail: newEmail,
    }

    const asked = await updateStudent(edit)
    expect(asked).toMatchObject({ success: false, code: 'PARENT_LINK_CONFIRM' })
    // The whole edit rolled back, not just the link.
    expect((await db.user.findUniqueOrThrow({ where: { id: child.id } })).parentEmail).toBe(oldEmail)

    expect((await updateStudent({ ...edit, confirmParentLink: true })).success).toBe(true)
    expect((await linkOf(child.id))?.email).toBe(newEmail)
  })
})

describe('picking a child in the portal', () => {
  async function activeChild(parentId: string) {
    const child = await createStudent()
    await createEnrollment(child.id, (await createGroup()).id)
    await linkToParent(child.id, parentId)
    return child
  }

  it('grants only a child linked to this account', async () => {
    const parent = await createParent()
    const own = await activeChild(parent.id)
    const foreign = await activeChild((await createParent()).id)

    expect(await isSelectableChild(parent.id, own.id)).toBe(true)
    expect(await isSelectableChild(parent.id, foreign.id)).toBe(false)
  })

  it('refuses a linked child who is in no active program', async () => {
    const parent = await createParent()
    const child = await createStudent()
    await createEnrollment(child.id, (await createGroup()).id, { schoolYear: '2019/2020' })
    await linkToParent(child.id, parent.id)

    expect(await isSelectableChild(parent.id, child.id)).toBe(false)
  })

  // Auth.js posts CLIENT-supplied data into the update hook, so this is the
  // boundary that keeps one family out of another's portal.
  it('ignores a foreign id sent to the update hook and keeps the current claim', async () => {
    const parent = await createParent()
    const own = await activeChild(parent.id)
    const foreign = await activeChild((await createParent()).id)
    const token: { id: string; studentId?: string } = { id: parent.id, studentId: own.id }

    await applyChildSelection(token, { user: { studentId: foreign.id } })
    expect(token.studentId).toBe(own.id)

    await applyChildSelection(token, { user: { studentId: 42 } })
    expect(token.studentId).toBe(own.id)
  })

  it('switches to a sibling and clears on an explicit null', async () => {
    const parent = await createParent()
    const a = await activeChild(parent.id)
    const b = await activeChild(parent.id)
    const token: { id: string; studentId?: string } = { id: parent.id, studentId: a.id }

    await applyChildSelection(token, { user: { studentId: b.id } })
    expect(token.studentId).toBe(b.id)

    await applyChildSelection(token, { user: { studentId: null } })
    expect(token.studentId).toBeUndefined()
  })
})
