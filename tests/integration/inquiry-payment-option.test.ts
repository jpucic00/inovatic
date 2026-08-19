/**
 * "Način plaćanja" from the public form through to the enrollment.
 *
 * The rule is asymmetric on purpose, and both halves are asserted here:
 *
 *  - on an SLR sign-up the answer is REQUIRED. The form asks it with an
 *    asterisk, so a payload without one is stale or tampered and is refused.
 *  - on a radionica or the natjecateljski program the field is never rendered,
 *    and a value arriving anyway is DROPPED rather than refused — it gates
 *    nothing, so failing an otherwise valid sign-up over it would cost the
 *    association an upit.
 *
 * Both decisions are made against the course the SERVER resolved, not against
 * whichever <option>s the client claims to have shown.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import {
  createAdmin,
  createEnrollmentWindow,
  createModule,
  createModuleSchedule,
  relativeDateKey,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { mockSession } from './setup'
import type { InquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { submitInquiry } = await import('@/actions/inquiry')
const { createStudentFromInquiry } = await import('@/actions/admin/student')

// submitInquiry mails on success when a key is present — keep the tier offline.
beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const YEAR = computeSchoolYear()
const fx = fixtureScope()
const parentEmails: string[] = []
let emailCounter = 0

function uniqueEmail(): string {
  const email = `pay-opt-${Date.now().toString(36)}-${++emailCounter}@test.local`
  parentEmails.push(email)
  return email
}

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { parentEmail: { in: parentEmails } } })
  await fx.cleanup()
})

/** An SLR program with an open window and one bookable group. */
async function openStandardProgram() {
  const course = await fx.course({ kind: 'STANDARD', level: 'SLR_1' })
  const moduleRow = await createModule(course.id)
  await createModuleSchedule(moduleRow.id, {
    schoolYear: YEAR,
    city: 'SPLIT',
    startDate: new Date(`${relativeDateKey(30)}T00:00:00.000Z`),
    endDate: new Date(`${relativeDateKey(90)}T00:00:00.000Z`),
  })
  await createEnrollmentWindow(course.id, {
    schoolYear: YEAR,
    city: 'SPLIT',
    enrollmentStart: new Date('2020-01-01'),
    enrollmentEnd: new Date('2099-12-31'),
  })
  const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
  return { course, group }
}

/** An open radionica with one upcoming termin. */
async function openRadionica() {
  const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR })
  await createEnrollmentWindow(course.id, {
    schoolYear: YEAR,
    city: 'SPLIT',
    enrollmentStart: new Date('2020-01-01'),
    enrollmentEnd: new Date('2099-12-31'),
  })
  const group = await fx.group({
    courseId: course.id,
    city: 'SPLIT',
    schoolYear: YEAR,
    dateStart: relativeDateKey(30),
    dateEnd: relativeDateKey(35),
  })
  return { course, group }
}

function inquiryFor(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2016-06-12',
    grade: '1',
    consent: true,
    ...overrides,
  }
}

async function storedInquiry(parentEmail: string) {
  return db.inquiry.findFirst({ where: { parentEmail } })
}

describe('submitInquiry — način plaćanja', () => {
  it('stores the answer on an SLR sign-up', async () => {
    const { course, group } = await openStandardProgram()
    const data = inquiryFor({
      courseId: course.id,
      scheduledGroupId: group.id,
      paymentOption: 'CIJELA_GODINA',
    })

    const res = await submitInquiry(data)

    expect(res.success).toBe(true)
    expect((await storedInquiry(data.parentEmail))?.paymentOption).toBe('CIJELA_GODINA')
  })

  it('refuses an SLR sign-up that answers nothing', async () => {
    const { course, group } = await openStandardProgram()
    const data = inquiryFor({ courseId: course.id, scheduledGroupId: group.id })

    const res = await submitInquiry(data)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Odaberite način plaćanja.')
    expect(await storedInquiry(data.parentEmail)).toBeNull()
  })

  it('accepts a radionica sign-up and drops the answer it never asked for', async () => {
    // The upit is what matters — the association must not lose a workshop
    // sign-up because a crafted payload carried an irrelevant extra field.
    const { course, group } = await openRadionica()
    const data = inquiryFor({
      courseId: course.id,
      scheduledGroupId: group.id,
      paymentOption: 'PO_MODULU',
    })

    const res = await submitInquiry(data)

    expect(res.success).toBe(true)
    expect((await storedInquiry(data.parentEmail))?.paymentOption).toBeNull()
  })

  it('resolves the program from the GROUP, not the submitted courseId', async () => {
    // A payload claiming an SLR course while booking a radionica termin must be
    // judged on the termin: the group is the thing the client cannot forge.
    const standard = await openStandardProgram()
    const radionica = await openRadionica()
    const data = inquiryFor({
      courseId: standard.course.id,
      scheduledGroupId: radionica.group.id,
      paymentOption: 'PO_MODULU',
    })

    const res = await submitInquiry(data)

    expect(res.success).toBe(true)
    expect((await storedInquiry(data.parentEmail))?.paymentOption).toBeNull()
  })
})

describe('createStudentFromInquiry — seeding the enrollment', () => {
  it('carries the parent’s answer onto the new enrollment', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const { course, group } = await openStandardProgram()
    const data = inquiryFor({
      courseId: course.id,
      scheduledGroupId: group.id,
      paymentOption: 'PO_MODULU',
    })
    expect((await submitInquiry(data)).success).toBe(true)
    const inquiry = await storedInquiry(data.parentEmail)

    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const res = await createStudentFromInquiry(inquiry!.id, group.id)
    expect(res.success).toBe(true)

    const enrollment = await db.enrollment.findFirst({
      where: { scheduledGroupId: group.id },
      select: { paymentOption: true },
    })
    expect(enrollment?.paymentOption).toBe('PO_MODULU')
  })

  it('never overwrites a value an admin has already corrected', async () => {
    // Accepting a second upit onto the same group reuses the existing enrollment
    // row. The parent's sign-up guess must not come back and undo the correction.
    const admin = await createAdmin({ city: 'SPLIT' })
    const { course, group } = await openStandardProgram()

    const first = inquiryFor({
      courseId: course.id,
      scheduledGroupId: group.id,
      paymentOption: 'PO_MODULU',
    })
    expect((await submitInquiry(first)).success).toBe(true)
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const firstInquiry = await storedInquiry(first.parentEmail)
    expect((await createStudentFromInquiry(firstInquiry!.id, group.id)).success).toBe(true)

    const enrollment = await db.enrollment.findFirstOrThrow({
      where: { scheduledGroupId: group.id },
    })
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { paymentOption: 'CIJELA_GODINA' },
    })

    // The same child files a second upit answering differently.
    const second = inquiryFor({
      parentEmail: first.parentEmail,
      courseId: course.id,
      scheduledGroupId: group.id,
      paymentOption: 'PO_MODULU',
    })
    expect((await submitInquiry(second)).success).toBe(true)
    const secondInquiry = await db.inquiry.findFirst({
      where: { parentEmail: first.parentEmail, status: 'NEW' },
    })
    expect((await createStudentFromInquiry(secondInquiry!.id, group.id)).success).toBe(true)

    const after = await db.enrollment.findUnique({
      where: { id: enrollment.id },
      select: { paymentOption: true },
    })
    expect(after?.paymentOption).toBe('CIJELA_GODINA')
  })
})
