/**
 * `submitInquiry` — the public form's entry point (Flux hnkfa7z).
 *
 * Only Playwright drove this action before, which left its *response shapes*
 * unpinned. Two of them are load-bearing: `GROUP_FULL` has to carry a fresh
 * `programs` payload or the form re-renders an empty dropdown and the parent is
 * told to pick another termin from nothing, and the invalid-payload path has to
 * write nothing at all.
 *
 * The confirmation e-mail's own decisions live in
 * `inquiry-confirmation-email.test.ts`; the city, school-year, termin-required
 * and radionica-cutoff branches each have their own file. What is left here is
 * the row the action writes and the answers it gives back.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { createEnrollment, createStudent, relativeDateKey } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { submitInquiry } = await import('@/actions/inquiry')

const YEAR = computeSchoolYear()
const scope = fixtureScope()

let counter = 0
const uniqueEmail = () => `public-upit-${Date.now().toString(36)}-${++counter}@test.local`

function validForm(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Ana Anić',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Ivo',
    childLastName: 'Anić',
    childDateOfBirth: '2015-06-12',
    grade: GRADE_VALUES[0],
    consent: true,
    ...overrides,
  }
}

/**
 * A workshop with an open signup window and a termin that has not started.
 * Radionica deliberately: it needs no module schedules, so capacity is the
 * lifetime enrollment count and "full" is reachable with `maxStudents` rows.
 */
async function openRadionica(maxStudents: number) {
  const course = await scope.course({ kind: 'RADIONICA' })
  await db.courseEnrollmentWindow.create({
    data: {
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      enrollmentStart: new Date(Date.now() - 86_400_000),
      enrollmentEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  })
  const group = await scope.group({
    courseId: course.id,
    schoolYear: YEAR,
    city: 'SPLIT',
    maxStudents,
    dateStart: relativeDateKey(14),
    dateEnd: relativeDateKey(18),
  })
  return { course, group }
}

beforeAll(async () => {
  // No key ⇒ the senders no-op, so nothing here talks to Resend.
  delete process.env.RESEND_API_KEY
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
})

afterAll(async () => {
  await scope.cleanup()
})

describe('submitInquiry — the row it writes', () => {
  it('files a booked termin with consent stamped and the optional fields left null', async () => {
    const { group } = await openRadionica(8)
    const form = validForm({
      scheduledGroupId: group.id,
      grade: '3',
    })

    const res = await submitInquiry(form)

    expect(res.success).toBe(true)
    const row = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })
    expect(row.scheduledGroupId).toBe(group.id)
    expect(row.status).toBe('NEW')
    expect(row.childGrade).toBe('3')
    expect(row.city).toBe('SPLIT')
    // Consent is a legal record, not a checkbox echo — the timestamp is the proof.
    expect(row.consentGivenAt).not.toBeNull()
    // Omitted optionals must be NULL rather than '' — every admin view and the
    // notification e-mail branch on absence.
    expect(row.childSchool).toBeNull()
    expect(row.message).toBeNull()
    expect(row.referralSource).toBeNull()
  })

  it('keeps the optional answers that were given', async () => {
    const { group } = await openRadionica(8)
    const form = validForm({
      scheduledGroupId: group.id,
      childSchool: 'OŠ Mertojak',
      message: 'Dijete je već sudjelovalo na radionici.',
      referralSource: 'Preporuka prijatelja',
    })

    expect((await submitInquiry(form)).success).toBe(true)

    const row = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })
    expect(row.childSchool).toBe('OŠ Mertojak')
    expect(row.message).toBe('Dijete je već sudjelovalo na radionici.')
    expect(row.referralSource).toBe('Preporuka prijatelja')
  })

  it('takes a termin-less upit for a program that has no bookable group', async () => {
    // A program whose window is open but which has no groups at all: nothing is
    // bookable, so the termin question has no answer to demand. Scoping the
    // check to this course with `courseId` is what makes the case deterministic
    // in a shared database — a neighbour's open program cannot make a termin
    // required here.
    const course = await scope.course({ kind: 'RADIONICA' })
    await db.courseEnrollmentWindow.create({
      data: {
        courseId: course.id,
        schoolYear: YEAR,
        city: 'SPLIT',
        enrollmentStart: new Date(Date.now() - 86_400_000),
        enrollmentEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
    const form = validForm({ courseId: course.id })

    const res = await submitInquiry(form)

    expect(res.success).toBe(true)
    const row = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })
    expect(row.scheduledGroupId).toBeNull()
    expect(row.courseId).toBe(course.id)
    // No group ⇒ no group year to inherit, so the row falls back to today's year.
    expect(row.schoolYear).toBe(YEAR)
  })
})

describe('submitInquiry — the answers it gives back', () => {
  it('answers GROUP_FULL with a usable feed and writes nothing', async () => {
    const { course, group } = await openRadionica(1)
    // Fill the single seat.
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: YEAR })

    const form = validForm({ scheduledGroupId: group.id })
    const res = await submitInquiry(form)

    // Narrowed rather than asserted field-by-field: `programs` lives only on the
    // coded failure members, so this is also a check that the coded one came back.
    if (res.success || !('code' in res)) {
      throw new Error(`expected a coded failure, got ${JSON.stringify(res)}`)
    }
    expect(res.code).toBe('GROUP_FULL')
    // The form re-renders availability from this payload instead of reloading,
    // so an empty array here would leave the parent choosing from nothing.
    expect(res.programs.length).toBeGreaterThan(0)
    const refreshed = res.programs.find((p) => p.id === course.id)
    expect(refreshed).toBeDefined()
    expect(refreshed?.groups.find((g) => g.id === group.id)?.isFull).toBe(true)

    expect(await db.inquiry.count({ where: { parentEmail: form.parentEmail } })).toBe(0)
  })

  it('refuses an invalid payload without touching the table', async () => {
    const form = validForm({ parentEmail: 'not-an-email' })

    const res = await submitInquiry(form)

    expect(res).toEqual({ success: false, error: 'Podaci nisu valjani.' })
    // The address itself is the marker: a row can only carry it if the write ran
    // before validation, which is the regression this guards.
    expect(await db.inquiry.count({ where: { parentEmail: 'not-an-email' } })).toBe(0)
  })

  it('refuses a missing consent — the one field with no default', async () => {
    const form = validForm()
    const res = await submitInquiry({
      ...form,
      consent: false as unknown as true,
    })

    expect(res).toEqual({ success: false, error: 'Podaci nisu valjani.' })
    expect(await db.inquiry.count({ where: { parentEmail: form.parentEmail } })).toBe(0)
  })
})
