import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import {
  createCourse,
  createEnrollmentWindow,
  createGroup,
  createLocation,
  createModule,
  createModuleSchedule,
  createStudent,
} from './helpers/factory'
import { computeSchoolYear } from '@/lib/school-year'
import { fromDateKey, toDateKey } from '@/lib/session-dates'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { headers } from 'next/headers'
const mockedHeaders = headers as unknown as Mock

const YEAR = computeSchoolYear()
// A week well inside the school year, Mon–Sat.
const WEEK_START = '2026-09-07'
const WEEK_END = '2026-09-12'
const TUESDAY = '2026-09-08'

const { submitInquiry } = await import('@/actions/inquiry')
const { checkTrialEligibility } = await import('@/actions/trial-eligibility')
const { isFirstTimeChild } = await import('@/lib/trial-eligibility')

beforeEach(() => {
  sendMock.mockReset()
  mockedHeaders.mockResolvedValue({ get: () => '203.0.113.10' })
})

let seq = 0
const uniq = () => `${Date.now().toString(36)}${(++seq).toString(36)}`

/** A standard SLR group on Tuesdays, with an open enrollment window. */
async function standardGroup(opts: { city?: 'SPLIT' | 'SIBENIK' } = {}) {
  const city = opts.city ?? 'SPLIT'
  const location = await createLocation({ city })
  const course = await createCourse({ kind: 'STANDARD' })
  const mod = await createModule(course.id)
  await createModuleSchedule(mod.id, {
    schoolYear: YEAR,
    city,
    startDate: fromDateKey('2026-09-15'),
    endDate: fromDateKey('2026-11-03'),
  })
  await createEnrollmentWindow(course.id, {
    schoolYear: YEAR,
    city,
    enrollmentStart: new Date('2020-01-01'),
    enrollmentEnd: new Date('2099-01-01'),
  })
  const group = await createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: YEAR,
    city,
    dayOfWeek: 'Utorak',
    startTime: '17:00',
    endTime: '18:30',
  })
  return { course, group, city }
}

async function setTrialWeek(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  await db.trialWeek.upsert({
    where: { schoolYear_city: { schoolYear: YEAR, city } },
    create: {
      schoolYear: YEAR,
      city,
      startDate: fromDateKey(WEEK_START),
      endDate: fromDateKey(WEEK_END),
    },
    update: { startDate: fromDateKey(WEEK_START), endDate: fromDateKey(WEEK_END) },
  })
}

async function clearTrialWeeks() {
  await db.trialWeek.deleteMany({})
}

function inquiryPayload(overrides: Record<string, unknown> = {}) {
  const marker = uniq()
  return {
    city: 'SPLIT' as const,
    parentName: `Roditelj ${marker}`,
    parentEmail: `roditelj-${marker}@test.hr`,
    parentPhone: '0911111111',
    childFirstName: 'Novi',
    childLastName: `Polaznik${marker}`,
    childDateOfBirth: '2016-04-04',
    grade: '3' as const,
    consent: true as const,
    ...overrides,
  }
}

describe('isFirstTimeChild', () => {
  it('is true for a child with no account', async () => {
    expect(
      await isFirstTimeChild({
        firstName: 'Nepoznato',
        lastName: `Dijete${uniq()}`,
        dateOfBirth: '2016-01-01',
        parentEmail: `x-${uniq()}@test.hr`,
      }),
    ).toBe(true)
  })

  it('is false on the strict tier — name + date of birth', async () => {
    const marker = uniq()
    await createStudent({ firstName: 'Ana', lastName: `Strict${marker}`, dateOfBirth: '2015-05-05' })

    expect(
      await isFirstTimeChild({
        firstName: 'Ana',
        lastName: `Strict${marker}`,
        dateOfBirth: '2015-05-05',
        parentEmail: `whatever-${marker}@test.hr`,
      }),
    ).toBe(false)
  })

  /**
   * The tier that actually matters here: the Excel-imported cohort has no dates
   * of birth, so the strict rule alone would read almost every returning child
   * as new and hand out a free lesson to families of ten years' standing.
   */
  it('is false on the legacy tier — name + parent e-mail against a DOB-less account', async () => {
    const marker = uniq()
    const parentEmail = `legacy-${marker}@test.hr`
    await createStudent({
      firstName: 'Marko',
      lastName: `Legacy${marker}`,
      dateOfBirth: null,
      parentEmail,
    })

    expect(
      await isFirstTimeChild({
        firstName: 'Marko',
        lastName: `Legacy${marker}`,
        dateOfBirth: '2014-02-02',
        parentEmail,
      }),
    ).toBe(false)
  })

  it('is false for a child who attended in the OTHER city', async () => {
    const marker = uniq()
    await createStudent({
      firstName: 'Ivan',
      lastName: `Cross${marker}`,
      dateOfBirth: '2015-03-03',
      city: 'SIBENIK',
    })

    expect(
      await isFirstTimeChild({
        firstName: 'Ivan',
        lastName: `Cross${marker}`,
        dateOfBirth: '2015-03-03',
        parentEmail: `x-${marker}@test.hr`,
      }),
    ).toBe(false)
  })
})

describe('checkTrialEligibility', () => {
  it('answers true for a first-timer', async () => {
    const marker = uniq()
    const res = await checkTrialEligibility({
      childFirstName: 'Novi',
      childLastName: `Elig${marker}`,
      childDateOfBirth: '2016-06-06',
      parentEmail: `elig-${marker}@test.hr`,
    })
    expect(res.eligible).toBe(true)
  })

  it('answers false for a child who already has an account', async () => {
    const marker = uniq()
    await createStudent({
      firstName: 'Stari',
      lastName: `Elig${marker}`,
      dateOfBirth: '2015-06-06',
    })
    const res = await checkTrialEligibility({
      childFirstName: 'Stari',
      childLastName: `Elig${marker}`,
      childDateOfBirth: '2015-06-06',
      parentEmail: `elig-${marker}@test.hr`,
    })
    expect(res.eligible).toBe(false)
  })

  it('fails closed on a malformed payload', async () => {
    const res = await checkTrialEligibility({
      childFirstName: '',
      childLastName: '',
      childDateOfBirth: 'not-a-date',
      parentEmail: 'nope',
    })
    expect(res.eligible).toBe(false)
  })
})

describe('submitInquiry — probni sat', () => {
  it('grants the trial and stores the derived date for a first-timer', async () => {
    await setTrialWeek()
    const { course, group } = await standardGroup()

    const res = await submitInquiry(
      inquiryPayload({
        courseId: course.id,
        scheduledGroupId: group.id,
        wantsTrial: true,
      }) as Parameters<typeof submitInquiry>[0],
    )

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.nextStep).toBe('TRIAL_BOOKED')
      expect(res.trialDateLabel).toBe('08.09.2026.')
    }

    const row = await db.inquiry.findFirst({
      where: { scheduledGroupId: group.id },
      orderBy: { createdAt: 'desc' },
      select: { wantsTrial: true, trialDate: true },
    })
    expect(row?.wantsTrial).toBe(true)
    expect(row?.trialDate && toDateKey(row.trialDate)).toBe(TUESDAY)
  })

  /**
   * The rule the owner asked for, enforced where it counts: the form hides the
   * option from returning families, but the answer arrives in the payload, so a
   * crafted request must not buy a free lesson either.
   */
  it('DROPS a trial claimed for a child who already has an account', async () => {
    await setTrialWeek()
    const { course, group } = await standardGroup()
    const marker = uniq()
    await createStudent({
      firstName: 'Vracam',
      lastName: `Se${marker}`,
      dateOfBirth: '2015-09-09',
    })

    const res = await submitInquiry(
      inquiryPayload({
        childFirstName: 'Vracam',
        childLastName: `Se${marker}`,
        childDateOfBirth: '2015-09-09',
        courseId: course.id,
        scheduledGroupId: group.id,
        wantsTrial: true,
      }) as Parameters<typeof submitInquiry>[0],
    )

    expect(res.success).toBe(true)
    if (res.success) expect(res.nextStep).toBe('TERMIN_CHOSEN')

    const row = await db.inquiry.findFirst({
      where: { scheduledGroupId: group.id },
      orderBy: { createdAt: 'desc' },
      select: { wantsTrial: true, trialDate: true },
    })
    expect(row?.wantsTrial).toBe(false)
    expect(row?.trialDate).toBeNull()
  })

  it('records the request without a date when the year has no trial week', async () => {
    await clearTrialWeeks()
    const { course, group } = await standardGroup()

    const res = await submitInquiry(
      inquiryPayload({
        courseId: course.id,
        scheduledGroupId: group.id,
        wantsTrial: true,
      }) as Parameters<typeof submitInquiry>[0],
    )

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.nextStep).toBe('TRIAL_TO_ARRANGE')
      expect(res.trialDateLabel).toBeUndefined()
    }

    const row = await db.inquiry.findFirst({
      where: { scheduledGroupId: group.id },
      orderBy: { createdAt: 'desc' },
      select: { wantsTrial: true, trialDate: true },
    })
    expect(row?.wantsTrial).toBe(true)
    expect(row?.trialDate).toBeNull()
  })

  it('leaves an ordinary inquiry untouched', async () => {
    await setTrialWeek()
    const { course, group } = await standardGroup()

    const res = await submitInquiry(
      inquiryPayload({
        courseId: course.id,
        scheduledGroupId: group.id,
      }) as Parameters<typeof submitInquiry>[0],
    )

    expect(res.success).toBe(true)
    if (res.success) expect(res.nextStep).toBe('TERMIN_CHOSEN')

    const row = await db.inquiry.findFirst({
      where: { scheduledGroupId: group.id },
      orderBy: { createdAt: 'desc' },
      select: { wantsTrial: true, trialDate: true },
    })
    expect(row?.wantsTrial).toBe(false)
    expect(row?.trialDate).toBeNull()
  })

  /** Šibenik plans its own week; Split's must not leak across the tenant line. */
  it('does not use the other city trial week', async () => {
    await clearTrialWeeks()
    await setTrialWeek('SIBENIK')
    const { course, group } = await standardGroup({ city: 'SPLIT' })

    const res = await submitInquiry(
      inquiryPayload({
        courseId: course.id,
        scheduledGroupId: group.id,
        wantsTrial: true,
      }) as Parameters<typeof submitInquiry>[0],
    )

    expect(res.success).toBe(true)
    if (res.success) expect(res.nextStep).toBe('TRIAL_TO_ARRANGE')
  })
})

describe('public program feed', () => {
  it('carries the trial date on standard groups and null on radionice', async () => {
    await setTrialWeek()
    const { group } = await standardGroup()

    const { getActivePrograms } = await import('@/actions/public/programs')
    const programs = await getActivePrograms('SPLIT')
    const found = programs.flatMap((p) => p.groups).find((g) => g.id === group.id)

    expect(found?.trialDate).toBe(TUESDAY)
  })
})
