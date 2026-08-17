/**
 * A radionica stops being offered once it starts.
 *
 * A workshop runs once, on a closed [dateStart, dateEnd] range, so a parent who
 * picks a termin that already began is signing up for something that cannot
 * happen — an inquiry still has to be read and turned into an account by an
 * admin. The cutoff is the start day, and it is enforced twice:
 *
 *   - `loadPrograms` → `toActiveGroup` drops the group, which covers every
 *     public surface at once (`/prijava`, `/radionice/<slug>`, `/prijava/<slug>`
 *     and the `/api/group-availability` poll behind them)
 *   - `submitInquiry` re-checks it, so a tab left open across the start date
 *     cannot post the termin it still has rendered
 *
 * Only radionice expire this way: a standard group is paced by its module arc
 * and a competition group runs a whole season.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import {
  createEnrollmentWindow,
  createModule,
  createModuleSchedule,
  relativeDateKey,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { zagrebDateKey } from '@/lib/attendance-window'
import type { InquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getActivePrograms, getSignupProgram } = await import('@/actions/public/programs')
const { GET: availabilityGET } = await import('@/app/api/group-availability/route')
const { submitInquiry } = await import('@/actions/inquiry')

// submitInquiry mails on success when a key is present — keep the tier offline.
beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const YEAR = '2026/2027'
const fx = fixtureScope()
const parentEmails: string[] = []
let emailCounter = 0

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { parentEmail: { in: parentEmails } } })
  await fx.cleanup()
})

const uniqueEmail = () => {
  const email = `rad-cutoff-${Date.now().toString(36)}-${++emailCounter}@test.local`
  parentEmails.push(email)
  return email
}

/** An open radionica with one group on the given range. */
async function openRadionica(range: { dateStart: string | null; dateEnd: string | null }) {
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
    ...range,
  })
  return { course, group }
}

const offeredGroupIds = async (city: 'SPLIT' | 'SIBENIK' = 'SPLIT') =>
  (await getActivePrograms(city)).flatMap((p) => p.groups.map((g) => g.id))

function inquiryFor(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2015-06-12',
    grade: '3',
    consent: true,
    ...overrides,
  }
}

describe('the public feed offers a radionica only before it starts', () => {
  it('offers an upcoming workshop', async () => {
    const { course, group } = await openRadionica({
      dateStart: relativeDateKey(30),
      dateEnd: relativeDateKey(35),
    })

    expect(await offeredGroupIds()).toContain(group.id)
    // The by-slug link behind /radionice/<slug> reads the same feed.
    const program = await getSignupProgram('SPLIT', course.slug)
    expect(program?.groups.map((g) => g.id)).toContain(group.id)
  })

  it('drops a workshop that has already finished', async () => {
    const { course, group } = await openRadionica({
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })

    expect(await offeredGroupIds()).not.toContain(group.id)
    // Its only group is gone, so the program itself leaves the catalog and the
    // page renders its "leave us an inquiry instead" state.
    expect(await getSignupProgram('SPLIT', course.slug)).toBeNull()
  })

  it('drops a workshop that is still running', async () => {
    const { group } = await openRadionica({
      dateStart: relativeDateKey(-2),
      dateEnd: relativeDateKey(3),
    })

    expect(await offeredGroupIds()).not.toContain(group.id)
  })

  it('drops it on its own start day, not the day after', async () => {
    // Anchored on the Zagreb calendar day — the same clock the cutoff reads.
    const { group } = await openRadionica({
      dateStart: zagrebDateKey(new Date()),
      dateEnd: zagrebDateKey(new Date()),
    })

    expect(await offeredGroupIds()).not.toContain(group.id)
  })

  it('keeps a dateless group — missing data must not silently retire a termin', async () => {
    const { group } = await openRadionica({ dateStart: null, dateEnd: null })

    expect(await offeredGroupIds()).toContain(group.id)
  })

  it('the /api/group-availability poll applies the same cutoff', async () => {
    const { course, group } = await openRadionica({
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })

    const res = await availabilityGET(
      new Request(
        `http://localhost/api/group-availability?city=SPLIT&courseId=${course.id}`,
      ),
    )
    expect(res.status).toBe(200)
    const programs = (await res.json()) as { groups: { id: string }[] }[]
    expect(programs.flatMap((p) => p.groups.map((g) => g.id))).not.toContain(group.id)
  })

  it('leaves a standard group alone — it is paced by its module arc, not a date range', async () => {
    const course = await fx.course({ kind: 'STANDARD' })
    const moduleRow = await createModule(course.id)
    await createModuleSchedule(moduleRow.id, {
      schoolYear: YEAR,
      city: 'SPLIT',
      // A window that has not opened yet, so the arc still has a next module.
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

    expect(await offeredGroupIds()).toContain(group.id)
  })
})

describe('submitInquiry re-checks the cutoff', () => {
  it('rejects a termin whose workshop has already started, and writes nothing', async () => {
    const { course, group } = await openRadionica({
      dateStart: relativeDateKey(-2),
      dateEnd: relativeDateKey(3),
    })
    const form = inquiryFor({ courseId: course.id, scheduledGroupId: group.id })

    const res = await submitInquiry(form)

    expect(res.success).toBe(false)
    if (res.success || !('code' in res)) throw new Error('expected a TERMIN_CLOSED result')
    expect(res.code).toBe('TERMIN_CLOSED')
    // The refreshed feed no longer carries the group, so the dropdown clears
    // instead of re-offering what was just refused.
    expect(res.programs.flatMap((p) => p.groups.map((g) => g.id))).not.toContain(group.id)
    expect(
      await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } }),
    ).toBeNull()
  })

  it('accepts a termin on an upcoming workshop', async () => {
    const { course, group } = await openRadionica({
      dateStart: relativeDateKey(30),
      dateEnd: relativeDateKey(35),
    })
    const form = inquiryFor({ courseId: course.id, scheduledGroupId: group.id })

    expect(await submitInquiry(form)).toMatchObject({ success: true })
    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.scheduledGroupId).toBe(group.id)
  })

  it('still takes a termin-less inquiry once every termin has passed', async () => {
    // Nothing bookable is left, so picking a termin stops being mandatory and
    // the parent can still ask to be contacted about the next workshop.
    const { course } = await openRadionica({
      dateStart: relativeDateKey(-30),
      dateEnd: relativeDateKey(-25),
    })
    const form = inquiryFor({ courseId: course.id })

    expect(await submitInquiry(form)).toMatchObject({ success: true })
    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.scheduledGroupId).toBeNull()
  })
})
