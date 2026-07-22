import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createInquiry,
} from './helpers/factory'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import type { InquiryFormData } from '@/lib/validators/inquiry'

// getInquiries calls revalidatePath? No — but other admin actions imported in
// the same module graph might. Stub next/cache so nothing throws out of scope.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// getSelectedSchoolYear() reads next/headers cookies(); stub it so the admin
// inquiry list filter resolves to a deterministic year per test.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined
        ? { value, name }
        : undefined,
  })
}

beforeAll(async () => {
  // submitInquiry sends a confirmation email when RESEND_API_KEY is set; the
  // test environment must not talk to Resend.
  delete process.env.RESEND_API_KEY
  setSelectedYearCookie(undefined)
  // getSelectedSchoolYear() honours a cookie year only when it exists in the
  // SchoolYear registry, else it falls back to the computed current year — so
  // register both years this suite switches the cookie between.
  const currentYear = computeSchoolYear()
  const futureYear = getNextSchoolYear(currentYear)
  await db.schoolYear.upsert({ where: { label: currentYear }, create: { label: currentYear }, update: {} })
  await db.schoolYear.upsert({ where: { label: futureYear }, create: { label: futureYear }, update: {} })
})

const { submitInquiry } = await import('@/actions/inquiry')
const { getInquiries, getInquiryCourses } = await import('@/actions/admin/inquiry')

let emailCounter = 0
const uniqueEmail = () => `sy-${Date.now().toString(36)}-${++emailCounter}@test.local`

function validForm(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2015-06-12',
    grade: GRADE_VALUES[0],
    consent: true,
    ...overrides,
  }
}

describe('submitInquiry — school year stamping', () => {
  it('stamps the chosen group\'s year (future-year group → that year, not "now")', async () => {
    const radionica = await createCourse({ isCustom: true })
    const futureYear = getNextSchoolYear(computeSchoolYear())
    const group = await createGroup({
      courseId: radionica.id,
      schoolYear: futureYear,
    })

    const form = validForm({ scheduledGroupId: group.id })
    const res = await submitInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({
      where: { parentEmail: form.parentEmail },
    })
    expect(created?.schoolYear).toBe(futureYear)
    // Sanity: the future year is genuinely different from the createdAt year,
    // so this proves we used the group's year and not computeSchoolYear().
    expect(futureYear).not.toBe(computeSchoolYear())
  })

  it('falls back to the computed current year when no group is selected', async () => {
    const form = validForm() // no scheduledGroupId
    const res = await submitInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({
      where: { parentEmail: form.parentEmail },
    })
    expect(created?.schoolYear).toBe(computeSchoolYear())
  })
})

describe('getInquiries — filters by the selected school year', () => {
  it('returns only inquiries whose schoolYear matches the cookie-selected year', async () => {
    const admin = await createAdmin()
    const currentYear = computeSchoolYear()
    const futureYear = getNextSchoolYear(currentYear)
    // Shared marker so the search filter isolates these two rows from any other
    // inquiries the suite created (the test DB is shared within the file).
    const marker = `YRFILTER${Date.now().toString(36)}`

    const current = await createInquiry({
      parentName: `${marker} Tekuca`,
      schoolYear: currentYear,
    })
    const future = await createInquiry({
      parentName: `${marker} Buduca`,
      schoolYear: futureYear,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })

    setSelectedYearCookie(currentYear)
    let res = await getInquiries({ search: marker })
    let ids = res.data.map((i) => i.id)
    expect(ids).toContain(current.id)
    expect(ids).not.toContain(future.id)

    setSelectedYearCookie(futureYear)
    res = await getInquiries({ search: marker })
    ids = res.data.map((i) => i.id)
    expect(ids).toContain(future.id)
    expect(ids).not.toContain(current.id)
  })

  it('excludes rows with a null schoolYear from every year view', async () => {
    const admin = await createAdmin()
    const marker = `YRNULL${Date.now().toString(36)}`
    const orphan = await createInquiry({
      parentName: `${marker} Bez godine`,
      schoolYear: null,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })

    setSelectedYearCookie(computeSchoolYear())
    let res = await getInquiries({ search: marker })
    expect(res.data.map((i) => i.id)).not.toContain(orphan.id)

    setSelectedYearCookie(getNextSchoolYear(computeSchoolYear()))
    res = await getInquiries({ search: marker })
    expect(res.data.map((i) => i.id)).not.toContain(orphan.id)
  })
})

describe('getInquiryCourses — radionica year-scoping', () => {
  it('lists standard courses globally but radionice only for the selected year', async () => {
    const admin = await createAdmin()
    const currentYear = computeSchoolYear()
    const futureYear = getNextSchoolYear(currentYear)

    // Standard courses are year-agnostic (schoolYear: null); radionice are
    // stamped with a school year, mirroring getCourses' OR predicate.
    const standard = await createCourse({ isCustom: false })
    const radioCurrent = await createCourse({ isCustom: true, schoolYear: currentYear })
    const radioFuture = await createCourse({ isCustom: true, schoolYear: futureYear })

    mockSession({ id: admin.id, role: 'ADMIN' })

    setSelectedYearCookie(currentYear)
    let ids = (await getInquiryCourses()).map((c) => c.id)
    expect(ids).toContain(standard.id)
    expect(ids).toContain(radioCurrent.id)
    expect(ids).not.toContain(radioFuture.id)

    setSelectedYearCookie(futureYear)
    ids = (await getInquiryCourses()).map((c) => c.id)
    expect(ids).toContain(standard.id)
    expect(ids).toContain(radioFuture.id)
    expect(ids).not.toContain(radioCurrent.id)
  })
})
