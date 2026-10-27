/**
 * A column sort on the paginated admin lists orders the WHOLE filtered list,
 * then pages it. It used to sort in the browser, i.e. only the 20 rows the
 * database had already cut in creation order — page 2 of "Ime A→Ž" started
 * back at A.
 *
 * Every fixture is created in the reverse of the order it must sort into, and
 * read one row per page, so a sort that only reorders a page fails outright.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createInquiry,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getStudents } = await import('@/actions/admin/student')
const { getInquiries } = await import('@/actions/admin/inquiry')

type StudentSort = NonNullable<Parameters<typeof getStudents>[0]>['sort']
type InquirySort = NonNullable<Parameters<typeof getInquiries>[0]>['sort']

const YEAR = computeSchoolYear()
const PAST = '2023/2024'
const MARKER = `SORT${Date.now().toString(36)}`

/** Created in this order — the reverse of Croatian alphabetical (Č after C). */
const STUDENT_NAMES = ['Čedo', 'Cvita', 'Ana']
const studentIds = new Map<string, string>()
let returningStudentId: string
let adminId: string

beforeAll(async () => {
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'inovatic_school_year' ? { value: YEAR, name } : undefined),
  })
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })

  adminId = (await createAdmin({ city: 'SPLIT' })).id

  const group = await createGroup({ schoolYear: YEAR })
  const pastGroup = await createGroup({ schoolYear: PAST })
  for (const firstName of STUDENT_NAMES) {
    const s = await createStudent({ firstName, lastName: MARKER })
    await createEnrollment(s.id, group.id, { schoolYear: YEAR })
    studentIds.set(firstName, s.id)
  }
  // The oldest account is the only returning one, so newest-first puts it last.
  returningStudentId = studentIds.get('Čedo')!
  await createEnrollment(returningStudentId, pastGroup.id, { schoolYear: PAST })

  // Upiti: razred created highest first, so newest-first reads predškolci first
  // — sorted ascending it must still be predškolci, then 1., then 3.
  const queueStart = Date.now() - 60_000
  const upiti = [
    ['Cvijeta', '3'],
    ['Bruno', '1'],
    ['Ante', 'predskolci'],
  ] as const
  for (const [i, [childFirstName, childGrade]] of upiti.entries()) {
    const inquiry = await createInquiry({
      city: 'SPLIT',
      schoolYear: YEAR,
      childFirstName,
      childLastName: MARKER,
      childGrade,
    })
    // Waitlisted in creation order, so the queue reads Cvijeta, Bruno, Ante.
    await db.inquiry.update({
      where: { id: inquiry.id },
      data: { waitlistedAt: new Date(queueStart + i * 1000) },
    })
  }
})

beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
})

async function studentPages(sort?: StudentSort) {
  const names: string[] = []
  for (let page = 1; page <= STUDENT_NAMES.length; page++) {
    const result = await getStudents({ search: MARKER, schoolYear: YEAR, sort, page, pageSize: 1 })
    expect(result.total).toBe(STUDENT_NAMES.length)
    names.push(...result.data.map((r) => r.firstName))
  }
  return names
}

describe('getStudents — sort spans every page', () => {
  it('defaults to newest first', async () => {
    expect(await studentPages()).toEqual(['Ana', 'Cvita', 'Čedo'])
  })

  it('sorts names by the Croatian alphabet across pages', async () => {
    expect(await studentPages({ key: 'name', dir: 'asc' })).toEqual(['Ana', 'Cvita', 'Čedo'])
    expect(await studentPages({ key: 'name', dir: 'desc' })).toEqual(['Čedo', 'Cvita', 'Ana'])
  })

  it('sorts oldest first when asked', async () => {
    expect(await studentPages({ key: 'createdAt', dir: 'asc' })).toEqual(['Čedo', 'Cvita', 'Ana'])
  })

  it('puts the returning child on page 1 when Ponovni upis is sorted descending', async () => {
    const first = await getStudents({
      search: MARKER,
      schoolYear: YEAR,
      sort: { key: 'returning', dir: 'desc' },
      page: 1,
      pageSize: 1,
    })
    expect(first.data.map((r) => r.id)).toEqual([returningStudentId])
    expect(first.data[0].isReturning).toBe(true)
  })

  it('sorts only what a filter leaves, and counts only that', async () => {
    const names: string[] = []
    for (let page = 1; page <= 2; page++) {
      const result = await getStudents({
        search: MARKER,
        schoolYear: YEAR,
        returning: 'NEW',
        sort: { key: 'name', dir: 'desc' },
        page,
        pageSize: 1,
      })
      expect(result.total).toBe(2)
      names.push(...result.data.map((r) => r.firstName))
    }
    expect(names).toEqual(['Cvita', 'Ana'])
  })

  it('falls back to newest first for a key it does not know', async () => {
    // The action is callable directly; it must not trust the page's parsing.
    const sort = { key: 'nope', dir: 'asc' } as unknown as StudentSort
    expect(await studentPages(sort)).toEqual(['Ana', 'Cvita', 'Čedo'])
  })
})

async function inquiryPages(view: 'ALL' | 'WAITLIST', sort?: InquirySort) {
  const names: (string | null)[] = []
  for (let page = 1; page <= 3; page++) {
    const result = await getInquiries({ search: MARKER, view, sort, page, pageSize: 1 })
    expect(result.total).toBe(3)
    names.push(...result.data.map((r) => r.childFirstName))
  }
  return names
}

describe('getInquiries — sort spans every page', () => {
  it('sorts razred by school order, not by the stored string', async () => {
    expect(await inquiryPages('ALL', { key: 'childGrade', dir: 'asc' })).toEqual(['Ante', 'Bruno', 'Cvijeta'])
    expect(await inquiryPages('ALL', { key: 'childGrade', dir: 'desc' })).toEqual(['Cvijeta', 'Bruno', 'Ante'])
  })

  it('sorts the child column across pages', async () => {
    expect(await inquiryPages('ALL', { key: 'childName', dir: 'desc' })).toEqual(['Cvijeta', 'Bruno', 'Ante'])
  })

  it('keeps the lista čekanja in queue order by default and sorts it across pages', async () => {
    expect(await inquiryPages('WAITLIST')).toEqual(['Cvijeta', 'Bruno', 'Ante'])
    expect(await inquiryPages('WAITLIST', { key: 'child', dir: 'asc' })).toEqual(['Ante', 'Bruno', 'Cvijeta'])
  })

  it('ignores a key that belongs to the other tab', async () => {
    // `position` is a Lista čekanja column; on Svi upiti it must not reorder anything.
    expect(await inquiryPages('ALL', { key: 'position', dir: 'desc' })).toEqual(['Ante', 'Bruno', 'Cvijeta'])
  })
})
