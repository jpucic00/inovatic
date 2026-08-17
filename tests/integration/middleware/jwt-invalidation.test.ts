/**
 * A logged-in teacher's session dies once an admin deletes them (Flux 7m98hdx,
 * migrated from tests/phase3/31-jwt-soft-delete-invalidation.spec.ts; rewritten
 * off mirror-testing per Flux 2se21an).
 *
 * This file used to re-implement the callback's `deletedAt` condition and assert
 * on the copy, so it passed no matter what the real code did. It now drives the
 * two real halves end to end: the admin action that soft-deletes, and
 * `revalidateTokenClaims` — the DB-backed refresh the jwt callback delegates to,
 * which lives outside the tier-wide `@/lib/auth` mock.
 *
 * `city-auth.test.ts` covers the same function's city/TTL/legacy-claim
 * behaviour; what is unique here is the path from the admin's click to the
 * session going away.
 */
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { revalidateTokenClaims, type TokenClaims } from '@/lib/auth-token'
import { createAdmin, createTeacher } from '../helpers/factory'
import { mockSession } from '../setup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

const { deleteTeacher } = await import('@/actions/admin/teacher')

/** The claims a teacher's cookie carries, due for its next DB re-check. */
const staleToken = (teacher: { id: string }): TokenClaims => ({
  id: teacher.id,
  role: 'TEACHER',
  city: 'SPLIT',
  checkedAt: 0,
})

describe('JWT invalidation on soft-delete', () => {
  it('kills the session of a teacher the admin just deleted', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })
    const token = staleToken(teacher)
    // Still valid while they are on staff.
    expect(await revalidateTokenClaims({ ...token })).not.toBeNull()

    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    expect(await deleteTeacher(teacher.id)).toEqual({ success: true })

    expect(await revalidateTokenClaims({ ...token })).toBeNull()
    // Soft, not hard: the row stays so their materials and comments keep an author.
    const row = await db.user.findUnique({ where: { id: teacher.id } })
    expect(row?.deletedAt).not.toBeNull()
  })

  it('keeps a live teacher signed in and refreshes their claims', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })

    const result = await revalidateTokenClaims(staleToken(teacher))

    expect(result).not.toBeNull()
    expect(result?.role).toBe('TEACHER')
    expect(result?.city).toBe('SPLIT')
    expect(result?.checkedAt).toBeGreaterThan(0)
  })

  it('lets a cookie checked seconds ago through — eviction is within a minute, not instant', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    await deleteTeacher(teacher.id)

    const fresh: TokenClaims = {
      id: teacher.id,
      role: 'TEACHER',
      city: 'SPLIT',
      checkedAt: Date.now(),
    }

    // The 60s TTL is the deliberate cost of not querying on every request; a
    // test asserting instant death would be asserting something untrue.
    expect(await revalidateTokenClaims(fresh)).not.toBeNull()
  })
})
