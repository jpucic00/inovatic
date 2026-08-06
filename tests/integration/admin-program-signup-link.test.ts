import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse } from './helpers/factory'

// getProgramDetail reads the school-year cookie; requireAdminCtx redirects.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getProgramDetail } = await import('@/actions/admin/program-materials')

const SY = '2026/2027'
const createdCourseIds: string[] = []
let adminId = ''

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { name, value: SY } : undefined,
  })
  adminId = (await createAdmin({ city: 'SPLIT' })).id
})

// The tier's afterEach reverts to "no session", so log in per test.
beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
})

afterAll(async () => {
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
  await db.user.deleteMany({ where: { id: adminId } })
})

async function course(kind: 'STANDARD' | 'COMPETITION' | 'RADIONICA', slug: string) {
  const row = await createCourse({
    kind,
    slug,
    // Only a radionica is city-bound; the other two are shared.
    ...(kind === 'RADIONICA' ? { city: 'SPLIT' as const, schoolYear: SY } : {}),
  })
  createdCourseIds.push(row.id)
  return row
}

/**
 * The link behind "Kopiraj URL za upise" on /admin/programi/[courseId].
 *
 * It used to be `/prijava/<slug>` for every kind, but /prijava/[slug] answers
 * notFound() for a radionica — so on a radionica's detail page the admin copied
 * a link that 404'd. The list rows were already correct, which is why only the
 * detail page misbehaved.
 */
describe('getProgramDetail — copied signup link', () => {
  it('points the SLR ladder at /prijava/<slug>', async () => {
    const c = await course('STANDARD', 'signup-link-standard')
    const { course: detail } = await getProgramDetail(c.id)
    expect(detail.signupPath).toBe('/prijava/signup-link-standard')
  })

  it('points the competitive program at /prijava/<slug>', async () => {
    const c = await course('COMPETITION', 'signup-link-competition')
    const { course: detail } = await getProgramDetail(c.id)
    expect(detail.signupPath).toBe('/prijava/signup-link-competition')
  })

  it('points a radionica at its own /radionice/<slug> page, not /prijava', async () => {
    const c = await course('RADIONICA', 'signup-link-radionica')
    const { course: detail } = await getProgramDetail(c.id)
    expect(detail.signupPath).toBe('/radionice/signup-link-radionica')
    expect(detail.signupPath).not.toContain('/prijava/')
  })
})
