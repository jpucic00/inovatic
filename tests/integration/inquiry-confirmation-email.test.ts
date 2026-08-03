/**
 * What `submitInquiry` decides about the confirmation e-mail it sends: whether
 * the akontacija instruction goes in, and which "what happens next" promise
 * closes it. Both are derived from the program and the submitted payload, and
 * both are silent when wrong — the mail is fire-and-forget and its failure is
 * swallowed, so nothing downstream would catch an SLR parent being asked for a
 * deposit that does not exist, or a parent who booked a termin being told we
 * will get back to them with one.
 *
 * The program is resolved from the chosen group rather than the submitted
 * `courseId`, which is the part worth pinning at this level; the copy itself is
 * asserted over the template in
 * `tests/unit/lib/inquiry-confirmation-email.test.ts`, and the 20% arithmetic in
 * `tests/unit/lib/radionica-deposit.test.ts`.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { relativeDateKey } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import type { InquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// The confirmation e-mail is the subject here, so intercept the sender rather
// than the Resend client — what matters is the argument the action computes.
// Typed off the real sender so a signature change breaks this file loudly.
type ConfirmationSender = typeof import('@/lib/email').sendInquiryConfirmationEmail

const { sendInquiryConfirmationEmail } = vi.hoisted(() => ({
  sendInquiryConfirmationEmail: vi.fn<ConfirmationSender>(),
}))
vi.mock('@/lib/email', () => ({
  sendInquiryConfirmationEmail,
  sendPartyInquiryConfirmationEmail: vi.fn(async () => true),
}))

const { submitInquiry } = await import('@/actions/inquiry')

const YEAR = '2026/2027'
const fx = fixtureScope()
const parentEmails: string[] = []
let emailCounter = 0

beforeEach(() => {
  sendInquiryConfirmationEmail.mockReset()
  sendInquiryConfirmationEmail.mockResolvedValue(true)
})

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { parentEmail: { in: parentEmails } } })
  await fx.cleanup()
})

function inquiryFor(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  const parentEmail = `rad-deposit-${Date.now().toString(36)}-${++emailCounter}@test.local`
  parentEmails.push(parentEmail)
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail,
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2015-06-12',
    grade: '3',
    consent: true,
    ...overrides,
  }
}

/** A bookable group on `course`, dated ahead of the radionica start cutoff. */
const upcomingGroup = (courseId: string) =>
  fx.group({
    courseId,
    city: 'SPLIT',
    schoolYear: YEAR,
    dateStart: relativeDateKey(30),
    dateEnd: relativeDateKey(35),
  })

/** The single call this test made to the confirmation sender. */
function confirmationSent() {
  expect(sendInquiryConfirmationEmail).toHaveBeenCalledTimes(1)
  return sendInquiryConfirmationEmail.mock.calls[0][0]
}

const depositQuoted = () => confirmationSent().depositAmount

describe('radionica sign-up confirmation quotes the akontacija', () => {
  it('quotes 20% of the price for a priced radionica', async () => {
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 150 })
    const group = await upcomingGroup(course.id)

    expect(
      await submitInquiry(inquiryFor({ courseId: course.id, scheduledGroupId: group.id })),
    ).toEqual({ success: true })
    expect(depositQuoted()).toBe('30,00 eura')
  })

  it('quotes nothing for a free radionica', async () => {
    // Price is nullable and genuinely optional on the admin form; a workshop
    // that costs nothing must not be mailed a payment instruction.
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: null })
    const group = await upcomingGroup(course.id)

    expect(
      await submitInquiry(inquiryFor({ courseId: course.id, scheduledGroupId: group.id })),
    ).toEqual({ success: true })
    expect(depositQuoted()).toBeUndefined()
  })

  it('quotes nothing for a standard program, priced or not', async () => {
    const course = await fx.course({ kind: 'STANDARD', price: 300 })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })

    expect(
      await submitInquiry(inquiryFor({ courseId: course.id, scheduledGroupId: group.id })),
    ).toEqual({ success: true })
    expect(depositQuoted()).toBeUndefined()
  })

  it('quotes nothing when no termin was booked', async () => {
    // Once every termin has passed a radionica still takes a "contact me about
    // the next one" inquiry. The deposit is za odabrani ciklus, and there is no
    // chosen ciklus here — quoting one would ask a parent to pay for nothing.
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 150 })
    await fx.group({
      courseId: course.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })

    expect(await submitInquiry(inquiryFor({ courseId: course.id }))).toEqual({ success: true })
    expect(depositQuoted()).toBeUndefined()
  })

  it('reads the program off the chosen group, not the submitted courseId', async () => {
    // The group is authoritative everywhere else in submitInquiry; the deposit
    // must not be the one thing a crafted payload can turn off.
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 60 })
    const standard = await fx.course({ kind: 'STANDARD', price: 300 })
    const group = await upcomingGroup(radionica.id)

    expect(
      await submitInquiry(inquiryFor({ courseId: standard.id, scheduledGroupId: group.id })),
    ).toEqual({ success: true })
    expect(depositQuoted()).toBe('12,00 eura')
  })
})

/**
 * The closing paragraph follows the same three-way split, and gets it from the
 * submitted payload rather than the program. Wording itself is asserted in
 * `tests/unit/lib/inquiry-confirmation-email.test.ts`.
 */
describe('confirmation says what actually happens next', () => {
  it('confirms the booked termin when the parent picked one', async () => {
    const course = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })

    await submitInquiry(inquiryFor({ courseId: course.id, scheduledGroupId: group.id }))
    expect(confirmationSent().nextStep).toBe('TERMIN_CHOSEN')
  })

  it('offers termini when none was on the table', async () => {
    // Every termin of this radionica has passed, so picking one stops being
    // mandatory and the team really does owe them the next workshop's dates.
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 150 })
    await fx.group({
      courseId: course.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })

    await submitInquiry(inquiryFor({ courseId: course.id }))
    expect(confirmationSent().nextStep).toBe('TERMIN_TO_OFFER')
  })

  it('promises to arrange one when the competitive parent refused the offered termini', async () => {
    const course = await fx.course({ kind: 'COMPETITION' })

    expect(
      await submitInquiry(inquiryFor({ courseId: course.id, noSuitableTermin: true })),
    ).toEqual({ success: true })
    expect(confirmationSent().nextStep).toBe('TERMIN_TO_ARRANGE')
  })
})
