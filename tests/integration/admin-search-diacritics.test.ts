import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createInquiry, createStudent } from './helpers/factory'
import { computeSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// getSelectedSchoolYear() reads next/headers cookies(); with no cookie it falls
// back to the computed current year, which is what every row here is stamped
// with.
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}))

const { getInquiries } = await import('@/actions/admin/inquiry')
const { getStudents } = await import('@/actions/admin/student')

// The tier shares one database with no per-file cleanup, so every row this file
// creates carries a marker unique to the run and every assertion is scoped to
// it. The marker is plain alphanumerics — unaccent() must not fold any of it.
const TAG = `${Date.now().toString(36)}dia`
const YEAR = computeSchoolYear()

let accented: { id: string }
let plain: { id: string }
let accentedStudentId: string
let adminId: string

// setup.ts reverts `auth()` to "no session" after every test, so the admin has
// to be re-injected per test rather than once in beforeAll.
beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
})

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
  const admin = await createAdmin({ city: 'SPLIT' })
  adminId = admin.id
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })

  accented = await createInquiry({
    city: 'SPLIT',
    schoolYear: YEAR,
    parentName: `Šimun${TAG} Perić${TAG}`,
    childFirstName: `Petra${TAG}`,
    childLastName: `Testić${TAG}`,
  })
  // Same first name, different surname: what a full-name search has to exclude.
  plain = await createInquiry({
    city: 'SPLIT',
    schoolYear: YEAR,
    parentName: `Ivan${TAG} Ivić${TAG}`,
    childFirstName: `Petra${TAG}`,
    childLastName: `Drugić${TAG}`,
  })

  const student = await createStudent({
    city: 'SPLIT',
    firstName: `Petra${TAG}`,
    lastName: `Testić${TAG}`,
  })
  accentedStudentId = student.id
  await createStudent({ city: 'SPLIT', firstName: `Petra${TAG}`, lastName: `Drugić${TAG}` })
})

describe('/admin/upiti search', () => {
  it('finds a diacritic surname typed without its diacritics', async () => {
    // ILIKE folds case but not accents, so this returned an empty table and
    // read as missing data — the whole reason unaccent() is in the query.
    const res = await getInquiries({ search: `Testic${TAG}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accented.id])
  })

  it('finds a diacritic surname typed WITH its diacritics', async () => {
    const res = await getInquiries({ search: `Testić${TAG}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accented.id])
  })

  it('still folds case, as it did before', async () => {
    const res = await getInquiries({ search: `TESTIC${TAG.toUpperCase()}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accented.id])
  })

  it('reaches an upit by the child’s full name, across both name columns', async () => {
    const full = await getInquiries({ search: `Petra${TAG} Testic${TAG}`, pageSize: 100 })
    expect(full.data.map((r) => r.id)).toEqual([accented.id])

    // One token still behaves like a plain contains-search over every column.
    const single = await getInquiries({ search: `Petra${TAG}`, pageSize: 100 })
    expect(new Set(single.data.map((r) => r.id))).toEqual(new Set([accented.id, plain.id]))
  })

  it('reaches the same upit by the parent’s name, undiacriticised', async () => {
    const res = await getInquiries({ search: `simun${TAG} peric${TAG}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accented.id])
  })

  it('treats a typed % as a literal character, not a wildcard', async () => {
    // The pattern is hand-built now, so the escaping Prisma’s `contains` did
    // for us has to be done by hand or one stray % matches the whole table.
    const wild = await getInquiries({ search: `%${TAG}`, pageSize: 100 })
    expect(wild.data).toHaveLength(0)

    // Positive control: the marker alone does reach both rows.
    const control = await getInquiries({ search: TAG, pageSize: 100 })
    expect(control.data.length).toBeGreaterThanOrEqual(2)
  })
})

describe('/admin/ucenici search', () => {
  it('finds a diacritic surname typed without its diacritics', async () => {
    const res = await getStudents({ search: `Testic${TAG}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accentedStudentId])
  })

  it('reaches a student by full name, across firstName and lastName', async () => {
    const res = await getStudents({ search: `Petra${TAG} Testic${TAG}`, pageSize: 100 })

    expect(res.data.map((r) => r.id)).toEqual([accentedStudentId])
  })

  it('returns the whole list when nothing is typed', async () => {
    // An empty search is "no filter", never "no matches" — the distinction the
    // null return of unaccentSearchFilter exists to keep.
    const res = await getStudents({ pageSize: 100 })

    expect(res.data.length).toBeGreaterThanOrEqual(2)
  })
})
