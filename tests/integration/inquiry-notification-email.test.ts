/**
 * The staff notification `submitInquiry` / `submitPartyInquiry` fire on every
 * successful sign-up. It is what turns "an upit exists in the admin" into "a
 * mail the team can act on and reply to from Outlook", so the parts that make
 * it usable are asserted here: the city it routes on, the id it links to, and
 * the termin line, which is assembled from the group rather than the payload.
 *
 * Inbox routing and reply-to live one layer down, in
 * `tests/unit/lib/email.test.ts` — this file pins what the ACTION computes.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { createStudent, relativeDateKey } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import type { InquiryFormData, PartyInquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Typed off the real senders so a signature change breaks this file loudly.
type NotificationSender = typeof import('@/lib/email').sendInquiryNotificationEmail
type PartyNotificationSender = typeof import('@/lib/email').sendPartyInquiryNotificationEmail

const { sendInquiryNotificationEmail, sendPartyInquiryNotificationEmail } = vi.hoisted(() => ({
  sendInquiryNotificationEmail: vi.fn<NotificationSender>(),
  sendPartyInquiryNotificationEmail: vi.fn<PartyNotificationSender>(),
}))
vi.mock('@/lib/email', () => ({
  sendInquiryNotificationEmail,
  sendPartyInquiryNotificationEmail,
  sendInquiryConfirmationEmail: vi.fn(async () => true),
  sendPartyInquiryConfirmationEmail: vi.fn(async () => true),
}))

const { submitInquiry, submitPartyInquiry } = await import('@/actions/inquiry')

const YEAR = '2026/2027'
const fx = fixtureScope()
const parentEmails: string[] = []
const studentIds: string[] = []
let emailCounter = 0

beforeEach(() => {
  sendInquiryNotificationEmail.mockReset()
  sendInquiryNotificationEmail.mockResolvedValue(true)
  sendPartyInquiryNotificationEmail.mockReset()
  sendPartyInquiryNotificationEmail.mockResolvedValue(true)
})

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { parentEmail: { in: parentEmails } } })
  await db.user.deleteMany({ where: { id: { in: studentIds } } })
  await fx.cleanup()
})

/**
 * An existing polaznik with a fixed identity — what makes a later upit for the
 * same child read as "Ponovni upis". Tracked for teardown: identity matching is
 * global, so a leftover student would flag another file's inquiries too.
 */
async function existingStudent(overrides: {
  firstName: string
  lastName: string
  dateOfBirth: string
  city?: 'SPLIT' | 'SIBENIK'
}) {
  const student = await createStudent(overrides)
  studentIds.push(student.id)
  return student
}

/**
 * Suffix that keeps a child's name unique. Identity matching is global and the
 * tier shares one database, so a fixed name would let a neighbouring file's
 * student decide whether this file's upit reads as returning.
 */
function uniqueTag(): string {
  return `${Date.now().toString(36)}-${++emailCounter}`
}

function nextParentEmail(): string {
  const parentEmail = `upit-notif-${Date.now().toString(36)}-${++emailCounter}@test.local`
  parentEmails.push(parentEmail)
  return parentEmail
}

function inquiryFor(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Ana Anić',
    parentEmail: nextParentEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Marko',
    childLastName: 'Anić',
    childDateOfBirth: '2016-06-15',
    grade: '3',
    consent: true,
    ...overrides,
  }
}

/** The single call this test made to the course notification sender. */
function notified() {
  expect(sendInquiryNotificationEmail).toHaveBeenCalledTimes(1)
  return sendInquiryNotificationEmail.mock.calls[0][0]
}

describe('every course inquiry announces itself to the city inbox', () => {
  it('routes on the inquiry city and links the stored upit', async () => {
    const course = await fx.course({ kind: 'STANDARD', title: 'Svijet LEGO robotike 2' })
    const location = await fx.location({ city: 'SIBENIK', name: 'Trokut inkubator' })
    const group = await fx.group({
      courseId: course.id,
      locationId: location.id,
      city: 'SIBENIK',
      schoolYear: YEAR,
      name: 'SLR 2',
      dayOfWeek: 'Utorak',
      startTime: '17:00',
      endTime: '18:30',
    })

    const data = inquiryFor({ city: 'SIBENIK', courseId: course.id, scheduledGroupId: group.id })
    expect(await submitInquiry(data)).toMatchObject({ success: true })

    const stored = await db.inquiry.findFirstOrThrow({
      where: { parentEmail: data.parentEmail },
      select: { id: true },
    })
    expect(notified()).toMatchObject({
      inquiryId: stored.id,
      city: 'SIBENIK',
      parentEmail: data.parentEmail,
      childName: 'Marko Anić',
      childDateOfBirth: '15.06.2016.',
      gradeLabel: '3. razred',
      programName: 'Svijet LEGO robotike 2',
      terminLabel: 'SLR 2 · Utorak · 17:00–18:30 · Trokut inkubator',
    })
  })

  it('renders a radionica termin as its date range, not a weekday', async () => {
    // A workshop has no dayOfWeek — the cycle's dates are what identifies it,
    // and a staff member reading the mail has to know which cycle was booked.
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 150 })
    const location = await fx.location({ city: 'SPLIT', name: 'Velebitska 32' })
    const group = await fx.group({
      courseId: course.id,
      locationId: location.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      name: 'Ljetna radionica',
      dateStart: relativeDateKey(30),
      dateEnd: relativeDateKey(34),
      startTime: '09:00',
      endTime: '11:00',
    })

    await submitInquiry(inquiryFor({ courseId: course.id, scheduledGroupId: group.id }))
    const { terminLabel } = notified()
    expect(terminLabel).toMatch(/^Ljetna radionica · \d{2}\.\d{2}\.\d{4}\. – /)
    expect(terminLabel).toContain('09:00–11:00 · Velebitska 32')
    expect(terminLabel).not.toContain('Ponedjeljak')
  })

  it("carries the competitive parent's refusal in the termin row", async () => {
    // "Ne odgovara mi predloženi termin" is an answer, not a missing one — the
    // inbox has to show it, since it is the whole reason this upit needs a call.
    const course = await fx.course({ kind: 'COMPETITION' })

    expect(
      await submitInquiry(inquiryFor({ courseId: course.id, noSuitableTermin: true })),
    ).toMatchObject({ success: true })
    expect(notified().terminLabel).toBe('Ne odgovara mi predloženi termin')
  })

  it('leaves the termin row empty when nothing was bookable', async () => {
    // Every termin of this radionica has passed, so the parent left their
    // details instead. No termin is itself the signal: this one needs dates.
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, price: 150 })
    await fx.group({
      courseId: course.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })

    await submitInquiry(inquiryFor({ courseId: course.id }))
    expect(notified().terminLabel).toBeUndefined()
  })

  it('marks the upit as a ponovni upis when the child is already a polaznik', async () => {
    // The same marker the upit list badges. Staff triaging from Outlook need it
    // before they open the admin: a returning child is enrolled into the next
    // level, not signed up from scratch.
    const child = { firstName: 'Petra', lastName: `Povratnik-${uniqueTag()}` }
    await existingStudent({ ...child, dateOfBirth: '2015-04-21', city: 'SPLIT' })

    const course = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
    await submitInquiry(
      inquiryFor({
        childFirstName: child.firstName,
        childLastName: child.lastName,
        childDateOfBirth: '2015-04-21',
        courseId: course.id,
        scheduledGroupId: group.id,
      }),
    )

    expect(notified().returning).toBe('SAME_CITY')
  })

  it('masks a match that exists only in the other city', async () => {
    // Identity matching is global, but the account itself is the other tenant's:
    // the mail may say a polaznik exists and nothing more, exactly as much as
    // /admin/upiti/[id] shows.
    const child = { firstName: 'Ivan', lastName: `Prekograd-${uniqueTag()}` }
    await existingStudent({ ...child, dateOfBirth: '2014-11-02', city: 'SIBENIK' })

    const course = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
    await submitInquiry(
      inquiryFor({
        childFirstName: child.firstName,
        childLastName: child.lastName,
        childDateOfBirth: '2014-11-02',
        courseId: course.id,
        scheduledGroupId: group.id,
      }),
    )

    expect(notified().returning).toBe('OTHER_CITY')
  })

  it('leaves the marker off a child nobody has seen before', async () => {
    const course = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })
    await submitInquiry(
      inquiryFor({
        childLastName: `Novak-${uniqueTag()}`,
        courseId: course.id,
        scheduledGroupId: group.id,
      }),
    )

    expect(notified().returning).toBeUndefined()
  })

  it('still reports success when the notification fails to send', async () => {
    // The upit is already committed at this point. A dead inbox must never
    // read to the parent as a failed sign-up.
    sendInquiryNotificationEmail.mockRejectedValue(new Error('Resend down'))
    const course = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({ courseId: course.id, city: 'SPLIT', schoolYear: YEAR })

    const data = inquiryFor({ courseId: course.id, scheduledGroupId: group.id })
    expect(await submitInquiry(data)).toMatchObject({ success: true })
    expect(
      await db.inquiry.count({ where: { parentEmail: data.parentEmail } }),
    ).toBe(1)
  })

  it('does not notify when the submission was rejected', async () => {
    // A rejected payload writes no upit, so there is nothing to announce.
    expect(await submitInquiry(inquiryFor({ parentEmail: 'not-an-email' }))).toEqual({
      success: false,
      error: 'Podaci nisu valjani.',
    })
    expect(sendInquiryNotificationEmail).not.toHaveBeenCalled()
  })
})

describe('every proslava inquiry announces itself too', () => {
  it('sends the party notification with the stored upit id and preferred date', async () => {
    const data: PartyInquiryFormData = {
      parentFirstName: 'Ana',
      parentLastName: 'Anić',
      parentEmail: nextParentEmail(),
      parentPhone: '+385912345678',
      message: 'Zanima nas proslava za 12 djece.',
      partyProposedDate: '2026-09-12',
      consent: true,
    }
    expect(await submitPartyInquiry(data)).toMatchObject({ success: true })

    const stored = await db.inquiry.findFirstOrThrow({
      where: { parentEmail: data.parentEmail },
      select: { id: true },
    })
    expect(sendPartyInquiryNotificationEmail).toHaveBeenCalledTimes(1)
    expect(sendPartyInquiryNotificationEmail.mock.calls[0][0]).toMatchObject({
      inquiryId: stored.id,
      parentName: 'Ana Anić',
      parentEmail: data.parentEmail,
      message: 'Zanima nas proslava za 12 djece.',
      partyProposedDate: '12.09.2026.',
    })
  })

  it('still notifies when the parent confirmation throws, and its own failure stays swallowed', async () => {
    // The two sends sit in separate try/catch blocks: the confirmation blowing
    // up must not cost the staff their notification, and the notification's own
    // failure must not surface as a failed sign-up.
    const email = await import('@/lib/email')
    vi.mocked(email.sendPartyInquiryConfirmationEmail).mockRejectedValueOnce(
      new Error('smtp down'),
    )
    sendPartyInquiryNotificationEmail.mockRejectedValueOnce(new Error('inbox down'))

    const data: PartyInquiryFormData = {
      parentFirstName: 'Iva',
      parentLastName: 'Ivić',
      parentEmail: nextParentEmail(),
      parentPhone: '+385912345678',
      message: 'Proslava unatoč kvaru maila.',
      partyProposedDate: '2026-10-03',
      consent: true,
    }
    expect(await submitPartyInquiry(data)).toMatchObject({ success: true })

    expect(sendPartyInquiryNotificationEmail).toHaveBeenCalledTimes(1)
    expect(
      await db.inquiry.findFirst({ where: { parentEmail: data.parentEmail } }),
    ).not.toBeNull()
  })
})
