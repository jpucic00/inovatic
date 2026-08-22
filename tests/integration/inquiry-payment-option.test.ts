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
  createEnrollment,
  createEnrollmentWindow,
  createModule,
  createModuleEnrollment,
  createModuleSchedule,
  createStudent,
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

/**
 * An SLR program whose upisi are CLOSED — it has a live module arc and a group,
 * but no open window, so `loadPrograms` leaves it out of the feed entirely. This
 * is the state a program drops into while a parent is already on Step 3.
 */
async function closedStandardProgram() {
  const course = await fx.course({ kind: 'STANDARD', level: 'SLR_2' })
  const moduleRow = await createModule(course.id)
  await createModuleSchedule(moduleRow.id, {
    schoolYear: YEAR,
    city: 'SPLIT',
    startDate: new Date(`${relativeDateKey(30)}T00:00:00.000Z`),
    endDate: new Date(`${relativeDateKey(90)}T00:00:00.000Z`),
  })
  // Deliberately NO CourseEnrollmentWindow.
  const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
  return { course, group }
}

/**
 * An SLR program that is offered but has nothing bookable left: open window,
 * live arc, and its only group full. The termin relaxes to optional there — the
 * "leave your details" path — while the payment question stays required.
 */
async function fullStandardProgram() {
  const course = await fx.course({ kind: 'STANDARD', level: 'SLR_3' })
  const moduleRow = await createModule(course.id)
  const schedule = await createModuleSchedule(moduleRow.id, {
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
  const group = await fx.group({
    courseId: course.id,
    city: 'SPLIT',
    schoolYear: YEAR,
    maxStudents: 1,
  })
  // The occupant needs a ModuleEnrollment for the NEXT enrolling module, not
  // just an Enrollment: on a dated program `computeGroupCapacity` counts seats
  // per module, so a bare enrollment leaves the group reading as empty.
  const occupant = await createStudent()
  const enrollment = await createEnrollment(occupant.id, group.id)
  await createModuleEnrollment(enrollment.id, schedule.id)
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

  it('files the upit when the program left the feed mid-form, instead of losing it', async () => {
    // The regression this precedence exists for. A mailed /prijava/<slug> link
    // carries `courseId`, and the form derives its payment field from the
    // availability feed it polls every 30s. If an admin closes the upisi while
    // the parent is on Step 3, the field is hidden AND the answer blanked — so
    // the payload arrives with no payment option through no fault of anyone.
    //
    // Resolving the course instead of reading the feed made the server demand
    // one anyway, and the refusal carries no `code`, so the parent got a red
    // "Odaberite način plaćanja." with no field on screen to answer it and a
    // closed-signups page on reload. The upit was lost — and without any payment
    // guard at all it would have been filed as an ordinary "leave your details"
    // inquiry, which is exactly the cost the strict arm is written to avoid.
    const { course } = await closedStandardProgram()
    const data = inquiryFor({ courseId: course.id })

    const res = await submitInquiry(data)

    expect(res.success).toBe(true)
    // Filed with no answer, for staff to follow up — deliberately permissive.
    expect((await storedInquiry(data.parentEmail))?.paymentOption).toBeNull()
  })

  it('still demands an answer when the program IS offered but nothing is bookable', async () => {
    // The other side of the same precedence, and the case that proves it did not
    // simply weaken the guard: the program is in the feed, so the question is
    // asked — even though every group is full and the termin has relaxed to
    // optional. This is the ordinary "leave your details" path on a live
    // program, and the form does render the field here.
    const { course } = await fullStandardProgram()
    const data = inquiryFor({ courseId: course.id, grade: '5' })

    const res = await submitInquiry(data)

    expect(res.success).toBe(false)
    expect(res).toMatchObject({ error: 'Odaberite način plaćanja.' })
    expect(await storedInquiry(data.parentEmail)).toBeNull()
  })

  it('accepts that same sign-up once the answer is there', async () => {
    const { course } = await fullStandardProgram()
    const data = inquiryFor({
      courseId: course.id,
      grade: '5',
      paymentOption: 'PO_MODULU',
    })

    const res = await submitInquiry(data)

    expect(res.success).toBe(true)
    expect((await storedInquiry(data.parentEmail))?.paymentOption).toBe('PO_MODULU')
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
