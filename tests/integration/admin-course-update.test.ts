import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse } from './helpers/factory'

// updateCourse revalidates and reads the school-year cookie — stub both so the
// action body runs without a request scope, and make requireAdmin's redirect a
// catchable throw.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { updateCourse } = await import('@/actions/admin/course')

const SY = '2026/2027'
const ARCHIVED_SY = '2020/2021'

const createdCourseIds: string[] = []
let adminId = ''

/** Log the shared Split admin in. Every test but the no-session one needs it. */
function loginAdmin() {
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
}

async function radionica(overrides: Parameters<typeof createCourse>[0] = {}) {
  const course = await createCourse({
    kind: 'RADIONICA',
    schoolYear: SY,
    city: 'SPLIT',
    ...overrides,
  })
  createdCourseIds.push(course.id)
  return course
}

/** The payload the Uredi dialog submits — every field, as the form sends them. */
function payload(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Ljetna radionica 2027',
    description: 'Petodnevna ljetna radionica robotike.',
    ageMin: 7,
    ageMax: 12,
    price: 90,
    ...overrides,
  } as Parameters<typeof updateCourse>[0]
}

function selectYear(year: string) {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { name, value: year } : undefined,
  })
}

beforeAll(async () => {
  for (const label of [SY, ARCHIVED_SY]) {
    await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  }
  selectYear(SY)
  adminId = (await createAdmin({ city: 'SPLIT' })).id
})

// Leave nothing behind: courses this file made would otherwise show up in
// other files' catalog queries, and the planner suite wipes courses globally.
afterAll(async () => {
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
  await db.user.deleteMany({ where: { id: adminId } })
})

describe('updateCourse — radionica edit', () => {
  it('saves every editable field', async () => {
    loginAdmin()

    const course = await radionica({ title: 'Stari naziv', price: 50 })

    const res = await updateCourse(payload(course.id))

    expect(res.success).toBe(true)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('Ljetna radionica 2027')
    expect(after.description).toBe('Petodnevna ljetna radionica robotike.')
    expect(after.ageMin).toBe(7)
    expect(after.ageMax).toBe(12)
    expect(after.price).toBe(90)
  })

  // Admins copy /radionice/<slug> out of the Programi list and send it to
  // parents — a rename must never invalidate a link already in an inbox.
  it('keeps the public slug when the title changes', async () => {
    loginAdmin()

    const course = await radionica({ slug: 'ljetna-radionica', title: 'Ljetna radionica' })

    const res = await updateCourse(payload(course.id, { title: 'Zimska radionica' }))

    expect(res.success).toBe(true)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('Zimska radionica')
    expect(after.slug).toBe('ljetna-radionica')
  })

  it('clears the price when the field is submitted empty', async () => {
    loginAdmin()

    const course = await radionica({ price: 80 })

    const res = await updateCourse(payload(course.id, { price: '' }))

    expect(res.success).toBe(true)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.price).toBeNull()
  })

  it('leaves city, schoolYear and kind untouched', async () => {
    loginAdmin()

    const course = await radionica()

    expect((await updateCourse(payload(course.id))).success).toBe(true)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.city).toBe('SPLIT')
    expect(after.schoolYear).toBe(SY)
    expect(after.kind).toBe('RADIONICA')
  })

  it('rejects an invalid payload without writing', async () => {
    loginAdmin()

    const course = await radionica({ title: 'Netaknuto' })

    const res = await updateCourse(payload(course.id, { title: 'X' }))

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/2 znaka/i)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('Netaknuto')
  })
})

describe('updateCourse — guards', () => {
  it('refuses a standard SLR program', async () => {
    loginAdmin()

    const course = await createCourse({ kind: 'STANDARD', title: 'SLR 1' })
    createdCourseIds.push(course.id)

    const res = await updateCourse(payload(course.id))

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/SLR/i)
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('SLR 1')
  })

  // Cross-city radionica reads as nonexistent — same message a bogus id gets,
  // so a Split admin can't probe Šibenik's catalog.
  it('reads another city’s radionica as nonexistent', async () => {
    loginAdmin()

    const course = await radionica({ city: 'SIBENIK', title: 'Šibenska radionica' })

    const res = await updateCourse(payload(course.id))

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Program nije pronađen.')
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('Šibenska radionica')
  })

  it('returns the same message for an unknown id', async () => {
    loginAdmin()

    const res = await updateCourse(payload('nepostojeci-id'))

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Program nije pronađen.')
  })

  it('blocks editing while an archived school year is selected', async () => {
    loginAdmin()

    const course = await radionica({ title: 'Arhiva' })
    selectYear(ARCHIVED_SY)

    try {
      const res = await updateCourse(payload(course.id))

      expect(res.success).toBe(false)
      if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
      const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
      expect(after.title).toBe('Arhiva')
    } finally {
      selectYear(SY)
    }
  })

  it('refuses a non-admin session', async () => {
    const course = await radionica({ title: 'Bez sesije' })

    await expect(updateCourse(payload(course.id))).rejects.toThrow()
    const after = await db.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(after.title).toBe('Bez sesije')
  })
})
