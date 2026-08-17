import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createInquiry,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// getInquiries reads the selected-year cookie; stub next/headers so the list
// resolves to a deterministic year. (getStudents deliberately does not — its
// reference year is passed in by the page.)
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getStudents } = await import('@/actions/admin/student')
const { getInquiries } = await import('@/actions/admin/inquiry')

const YEAR = '2025/2026'
const PAST = '2024/2025'
const NEXT = '2026/2027'

// Isolates this file's rows from everything else sharing the test DB.
const MARKER = `RET${Date.now().toString(36)}`

let adminId: string
let sibenikAdminId: string

// Students, by what they should read as for YEAR.
let returningId: string
let firstTimerId: string
let departedId: string
let futureOnlyId: string
let sibenikReturningId: string

beforeAll(async () => {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { value: YEAR, name } : undefined,
  })

  adminId = (await createAdmin()).id
  sibenikAdminId = (await createAdmin({ city: 'SIBENIK' })).id

  const pastGroup = await createGroup({ schoolYear: PAST })
  const yearGroup = await createGroup({ schoolYear: YEAR })
  const nextGroup = await createGroup({ schoolYear: NEXT })

  // Enrolled in YEAR and in an earlier year → ponovni upis.
  const returning = await createStudent({ lastName: `${MARKER}Vracen` })
  await createEnrollment(returning.id, pastGroup.id, { schoolYear: PAST })
  await createEnrollment(returning.id, yearGroup.id, { schoolYear: YEAR })
  returningId = returning.id

  // Enrolled in YEAR only → novi upis.
  const firstTimer = await createStudent({ lastName: `${MARKER}Novi` })
  await createEnrollment(firstTimer.id, yearGroup.id, { schoolYear: YEAR })
  firstTimerId = firstTimer.id

  // Enrolled only in an earlier year → neither; they did not come back.
  const departed = await createStudent({ lastName: `${MARKER}Otisao` })
  await createEnrollment(departed.id, pastGroup.id, { schoolYear: PAST })
  departedId = departed.id

  // Enrolled only in a LATER year (admin planning ahead) → neither for YEAR.
  const futureOnly = await createStudent({ lastName: `${MARKER}Buduci` })
  await createEnrollment(futureOnly.id, nextGroup.id, { schoolYear: NEXT })
  futureOnlyId = futureOnly.id

  // Same shape as `returning`, but in the other tenant.
  const sibenikGroupPast = await createGroup({ schoolYear: PAST, city: 'SIBENIK' })
  const sibenikGroupYear = await createGroup({ schoolYear: YEAR, city: 'SIBENIK' })
  const sibenikReturning = await createStudent({
    lastName: `${MARKER}Sibenik`,
    city: 'SIBENIK',
  })
  await createEnrollment(sibenikReturning.id, sibenikGroupPast.id, { schoolYear: PAST })
  await createEnrollment(sibenikReturning.id, sibenikGroupYear.id, { schoolYear: YEAR })
  sibenikReturningId = sibenikReturning.id
})

beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN' })
})

async function fetchStudents(filters: Parameters<typeof getStudents>[0] = {}) {
  const res = await getStudents({
    ...filters,
    search: MARKER,
    returningYear: filters?.returningYear ?? YEAR,
    pageSize: 100,
  })
  return res
}

async function studentIds(filters: Parameters<typeof getStudents>[0] = {}) {
  const res = await fetchStudents(filters)
  return new Set(res.data.map((r) => r.id))
}

describe('getStudents — isReturning flag', () => {
  it('flags only the student enrolled both in the year and before it', async () => {
    const res = await fetchStudents()
    const flag = (id: string) => res.data.find((r) => r.id === id)?.isReturning

    expect(flag(returningId)).toBe(true)
    expect(flag(firstTimerId)).toBe(false)
    expect(flag(departedId)).toBe(false)
    expect(flag(futureOnlyId)).toBe(false)
  })

  it('re-reads against whichever year is asked for', async () => {
    // Against PAST the returning student is a first-timer: nothing precedes it.
    const res = await fetchStudents({ returningYear: PAST })
    expect(res.data.find((r) => r.id === returningId)?.isReturning).toBe(false)
    expect(res.returningYear).toBe(PAST)
  })

  it('echoes the year the flags were resolved against', async () => {
    expect((await fetchStudents()).returningYear).toBe(YEAR)
    expect((await getStudents({ search: MARKER, schoolYear: PAST })).returningYear).toBe(
      PAST,
    )
  })
})

describe('getStudents — ponovni upis filter', () => {
  it('RETURNING extracts exactly the students who came back that year', async () => {
    const ids = await studentIds({ returning: 'RETURNING' })
    expect(ids.has(returningId)).toBe(true)
    expect(ids.has(firstTimerId)).toBe(false)
    expect(ids.has(departedId)).toBe(false)
    expect(ids.has(futureOnlyId)).toBe(false)
  })

  it('NEW extracts the first-timers of that year, not everyone else', async () => {
    const ids = await studentIds({ returning: 'NEW' })
    expect(ids.has(firstTimerId)).toBe(true)
    expect(ids.has(returningId)).toBe(false)
    // Neither of these is enrolled in YEAR at all, so neither is a new upis
    // for it — "not returning" must not collapse into "new".
    expect(ids.has(departedId)).toBe(false)
    expect(ids.has(futureOnlyId)).toBe(false)
  })

  it('narrows total and page slice together, so pagination stays honest', async () => {
    const res = await getStudents({
      search: MARKER,
      returning: 'RETURNING',
      returningYear: YEAR,
      pageSize: 100,
    })
    expect(res.total).toBe(res.data.length)
    expect(res.data.every((r) => r.isReturning)).toBe(true)
  })

  it('follows the requested year rather than a fixed one', async () => {
    // Against NEXT nobody has come back yet; against YEAR one has.
    expect((await studentIds({ returning: 'RETURNING', returningYear: NEXT })).size).toBe(0)
    expect((await studentIds({ returning: 'RETURNING', returningYear: YEAR })).size).toBe(1)
  })

  it('composes with the payment filter without the AND clauses colliding', async () => {
    // Both narrow on enrollments, and each used to claim the single AND key.
    // Asserted structurally rather than against a payment verdict: adding the
    // payment filter may only ever shrink the returning cohort, and the two
    // payment directions may never claim the same student. If one clause
    // overwrote the other, one of those two would stop holding.
    const returningOnly = await studentIds({ returning: 'RETURNING' })
    const paid = await studentIds({ returning: 'RETURNING', paymentStatus: 'PAID' })
    const pending = await studentIds({ returning: 'RETURNING', paymentStatus: 'PENDING' })

    expect(returningOnly.has(returningId)).toBe(true)
    for (const id of [...paid, ...pending]) expect(returningOnly.has(id)).toBe(true)
    for (const id of paid) expect(pending.has(id)).toBe(false)
  })

  it('composes with the school-year filter', async () => {
    const ids = await studentIds({ returning: 'RETURNING', schoolYear: YEAR })
    expect(ids.has(returningId)).toBe(true)
    expect(ids.has(firstTimerId)).toBe(false)
  })

  it('never reaches across the city boundary', async () => {
    const split = await studentIds({ returning: 'RETURNING' })
    expect(split.has(sibenikReturningId)).toBe(false)

    mockSession({ id: sibenikAdminId, role: 'ADMIN', city: 'SIBENIK' })
    const sibenik = await studentIds({ returning: 'RETURNING' })
    expect(sibenik.has(sibenikReturningId)).toBe(true)
    expect(sibenik.has(returningId)).toBe(false)
  })
})

describe('getInquiries — ponovni upis filter', () => {
  const DOB = '2014-04-04'
  let returningInquiryId: string
  let freshInquiryId: string
  let partyInquiryId: string

  beforeAll(async () => {
    // An upit whose child already has an account in this city → ponovni upis.
    await createStudent({
      firstName: 'Ana',
      lastName: `${MARKER}Poznata`,
      dateOfBirth: DOB,
    })
    returningInquiryId = (
      await createInquiry({
        childFirstName: 'Ana',
        childLastName: `${MARKER}Poznata`,
        childDateOfBirth: DOB,
        schoolYear: YEAR,
      })
    ).id

    // Same year, no matching account → novi upis.
    freshInquiryId = (
      await createInquiry({
        childFirstName: 'Ivan',
        childLastName: `${MARKER}Nepoznat`,
        childDateOfBirth: DOB,
        schoolYear: YEAR,
      })
    ).id

    // A proslava carries no child at all.
    partyInquiryId = (
      await db.inquiry.create({
        data: {
          type: 'PARTY',
          parentName: `${MARKER} Proslava`,
          parentEmail: `party-${MARKER}@test.local`,
          parentPhone: '+38591000000',
          childFirstName: null,
          childLastName: null,
          childDateOfBirth: null,
          schoolYear: YEAR,
          city: 'SPLIT',
          consentGivenAt: new Date(),
        },
      })
    ).id
  })

  async function inquiryIds(filters: Parameters<typeof getInquiries>[0] = {}) {
    const res = await getInquiries({ ...filters, search: MARKER, pageSize: 100 })
    return new Set(res.data.map((r) => r.id))
  }

  it('lists all three kinds when the filter is off', async () => {
    const ids = await inquiryIds()
    expect(ids.has(returningInquiryId)).toBe(true)
    expect(ids.has(freshInquiryId)).toBe(true)
    expect(ids.has(partyInquiryId)).toBe(true)
  })

  it('RETURNING keeps only the upit whose child already has an account', async () => {
    const ids = await inquiryIds({ returning: 'RETURNING' })
    expect(ids.has(returningInquiryId)).toBe(true)
    expect(ids.has(freshInquiryId)).toBe(false)
    expect(ids.has(partyInquiryId)).toBe(false)
  })

  it('NEW keeps the first-time upit and still excludes proslave', async () => {
    const ids = await inquiryIds({ returning: 'NEW' })
    expect(ids.has(freshInquiryId)).toBe(true)
    expect(ids.has(returningInquiryId)).toBe(false)
    // A birthday party is not somebody's first enrollment.
    expect(ids.has(partyInquiryId)).toBe(false)
  })

  it('narrows total alongside the rows, so the count and the page agree', async () => {
    const res = await getInquiries({
      search: MARKER,
      returning: 'RETURNING',
      pageSize: 100,
    })
    expect(res.total).toBe(res.data.length)
    expect(res.data.every((r) => r.isReturning)).toBe(true)
  })

  it('paginates the narrowed set rather than filtering a page after the fact', async () => {
    const firstPage = await getInquiries({
      search: MARKER,
      returning: 'NEW',
      page: 1,
      pageSize: 1,
    })
    // One row on a page of one, and a total that counts only NEW rows — a
    // post-paging filter would have shown an empty page here whenever the
    // returning upit happened to sort first.
    expect(firstPage.data).toHaveLength(1)
    expect(firstPage.data[0].id).toBe(freshInquiryId)
    expect(firstPage.total).toBe(1)
  })

  it('composes with the status filter', async () => {
    const ids = await inquiryIds({ returning: 'RETURNING', status: 'NEW' })
    expect(ids.has(returningInquiryId)).toBe(true)

    const declined = await inquiryIds({ returning: 'RETURNING', status: 'DECLINED' })
    expect(declined.has(returningInquiryId)).toBe(false)
  })

  it('yields nothing when combined with Vrsta: Proslave, rather than overriding it', async () => {
    // The two filters genuinely do not intersect; silently switching the type
    // back to COURSE would answer a question the admin did not ask.
    expect((await inquiryIds({ returning: 'NEW', type: 'PARTY' })).size).toBe(0)
    expect((await inquiryIds({ returning: 'RETURNING', type: 'PARTY' })).size).toBe(0)
  })

  it('never reaches across the city boundary', async () => {
    mockSession({ id: sibenikAdminId, role: 'ADMIN', city: 'SIBENIK' })
    const ids = await inquiryIds({ returning: 'RETURNING' })
    expect(ids.has(returningInquiryId)).toBe(false)
  })
})
