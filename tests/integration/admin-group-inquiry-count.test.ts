/**
 * The "Upiti" column on /admin/grupe (Flux hvriqty).
 *
 * It renders `_count.preferredInquiries` straight off `getGroups`, and the
 * 16-programs-groups-enrollment slim dropped its three E2E assertions claiming
 * available-spots coverage had replaced them. It had not: capacity counts only
 * `status: 'NEW'` reservations, while this column counts every upit ever made
 * for the termin. Those two numbers diverge the moment an upit is declined, so
 * they are pinned here side by side — otherwise "the column shows 1" and "one
 * seat is held" look like the same fact.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { mockSession } from './setup'
import { createAdmin, createCourse, createGroup } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})
// Both getGroups and getInquiries resolve the year through getSelectedSchoolYear().
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const YEAR = computeSchoolYear()

const { submitInquiry } = await import('@/actions/inquiry')
const { getGroups } = await import('@/actions/admin/group')
const { declineInquiry } = await import('@/actions/admin/inquiry')

let counter = 0
const uniqueEmail = () => `upiti-count-${Date.now().toString(36)}-${++counter}@test.local`

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

/** The number the Upiti cell renders for `groupId`, read the way the page reads it. */
async function upitiColumnCount(groupId: string): Promise<number> {
  const groups = await getGroups()
  const row = groups.find((g) => g.id === groupId)
  if (!row) throw new Error(`group ${groupId} missing from getGroups()`)
  return row._count.preferredInquiries
}

/** Reserved seats — the NEW-only count capacity math actually consults. */
function reservedSpots(groupId: string): Promise<number> {
  return db.inquiry.count({ where: { scheduledGroupId: groupId, status: 'NEW' } })
}

beforeAll(async () => {
  // submitInquiry mails a confirmation when the key is set; tests stay offline.
  delete process.env.RESEND_API_KEY
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'inovatic_school_year' ? { value: YEAR, name } : undefined),
  })
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
})

async function bookableGroup() {
  const course = await createCourse({ kind: 'RADIONICA' })
  return createGroup({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })
}

describe('admin Upiti column — _count.preferredInquiries', () => {
  it('counts up as upiti pick the termin, and only for that termin', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const group = await bookableGroup()
    const otherGroup = await bookableGroup()
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    expect(await upitiColumnCount(group.id)).toBe(0)

    expect((await submitInquiry(validForm({ scheduledGroupId: group.id }))).success).toBe(true)
    expect(await upitiColumnCount(group.id)).toBe(1)

    expect((await submitInquiry(validForm({ scheduledGroupId: group.id }))).success).toBe(true)
    expect(await upitiColumnCount(group.id)).toBe(2)

    // The neighbouring termin is untouched — the count is per group, not per course.
    expect(await upitiColumnCount(otherGroup.id)).toBe(0)
  })

  it('ignores an upit that picked no termin', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const group = await bookableGroup()
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    expect((await submitInquiry(validForm())).success).toBe(true)

    expect(await upitiColumnCount(group.id)).toBe(0)
  })

  it('keeps a declined upit in the column while releasing its reserved seat', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const group = await bookableGroup()
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const form = validForm({ scheduledGroupId: group.id })
    expect((await submitInquiry(form)).success).toBe(true)
    expect(await upitiColumnCount(group.id)).toBe(1)
    expect(await reservedSpots(group.id)).toBe(1)

    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { parentEmail: form.parentEmail },
    })
    expect((await declineInquiry(inquiry.id, 'Roditelj je otkazao.')).success).toBe(true)

    // This is the divergence the dropped E2E assertions were guarding: the
    // column is a lifetime tally of upiti for the termin, so it does NOT drop,
    // while the seat the upit held goes back to the pool.
    expect(await upitiColumnCount(group.id)).toBe(1)
    expect(await reservedSpots(group.id)).toBe(0)
  })
})
