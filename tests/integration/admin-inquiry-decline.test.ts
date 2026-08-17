/**
 * Integration coverage for `declineInquiry` (Flux blv84ej).
 *
 * The Zod schema is pinned at the unit tier (tests/unit/validators/admin-inquiry.test.ts)
 * and the UI flow at the E2E tier; what had no coverage is the action body —
 * what actually lands in the row, what happens on a bad id, and that a decline
 * touches exactly one upit.
 *
 * Cross-city rejection is covered in city-scoping-inquiries.test.ts and is not
 * repeated here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createInquiry } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// assertInquiryInCity 404s through next/navigation's notFound(), which throws in
// a real request. Mirror that shape (same as city-scoping-inquiries.test.ts).
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

import { revalidatePath } from 'next/cache'
const { declineInquiry } = await import('@/actions/admin/inquiry')

async function signInAdmin() {
  const admin = await createAdmin()
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  return admin
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('declineInquiry', () => {
  it('declines a NEW upit and persists the reason verbatim', async () => {
    await signInAdmin()
    const inquiry = await createInquiry({ city: 'SPLIT' })

    const res = await declineInquiry(inquiry.id, 'Dijete je premlado za ovaj program.')

    expect(res).toEqual({ success: true })
    const row = await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })
    expect(row.status).toBe('DECLINED')
    expect(row.declineReason).toBe('Dijete je premlado za ovaj program.')
  })

  it('revalidates both the list and the upit detail path', async () => {
    await signInAdmin()
    const inquiry = await createInquiry({ city: 'SPLIT' })

    await declineInquiry(inquiry.id, 'Nema slobodnih mjesta.')

    expect(revalidatePath).toHaveBeenCalledWith('/admin/upiti')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/upiti/${inquiry.id}`)
  })

  it('stores the reason trimmed — the schema trims, so leading/trailing space never reaches the row', async () => {
    await signInAdmin()
    const inquiry = await createInquiry({ city: 'SPLIT' })

    await declineInquiry(inquiry.id, '   Roditelj se ne javlja.   ')

    const row = await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })
    expect(row.declineReason).toBe('Roditelj se ne javlja.')
  })

  it('rejects a too-short reason with the validator message and leaves the row NEW', async () => {
    await signInAdmin()
    const inquiry = await createInquiry({ city: 'SPLIT' })

    const res = await declineInquiry(inquiry.id, 'ab')

    expect(res).toEqual({ success: false, error: 'Razlog je obavezan.' })
    const row = await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })
    expect(row.status).toBe('NEW')
    expect(row.declineReason).toBeNull()
  })

  it('404s on an unknown id instead of reporting a write failure', async () => {
    await signInAdmin()
    const untouched = await createInquiry({ city: 'SPLIT' })

    // assertInquiryInCity runs before the update and cannot tell "nonexistent"
    // from "other city" — both are notFound(), so an unknown id never reaches
    // the generic 'Greška pri odbijanju upita.' fallback.
    await expect(
      declineInquiry('00000000-0000-0000-0000-000000000000', 'Validan razlog odbijanja.'),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    const row = await db.inquiry.findUniqueOrThrow({ where: { id: untouched.id } })
    expect(row.status).toBe('NEW')
  })

  it('answers with the generic error when the write itself fails', async () => {
    await signInAdmin()
    const inquiry = await createInquiry({ city: 'SPLIT' })
    vi.spyOn(db.inquiry, 'update').mockRejectedValue(new Error('connection reset'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await declineInquiry(inquiry.id, 'Validan razlog odbijanja.')

    expect(res).toEqual({ success: false, error: 'Greška pri odbijanju upita.' })
  })

  it('declines exactly one upit — the sibling is untouched', async () => {
    await signInAdmin()
    const target = await createInquiry({ city: 'SPLIT' })
    const sibling = await createInquiry({ city: 'SPLIT' })

    await declineInquiry(target.id, 'Program nije prikladan.')

    const other = await db.inquiry.findUniqueOrThrow({ where: { id: sibling.id } })
    expect(other.status).toBe('NEW')
    expect(other.declineReason).toBeNull()
  })
})
