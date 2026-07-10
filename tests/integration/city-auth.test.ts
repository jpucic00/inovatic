import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { revalidateTokenClaims, type TokenClaims } from '@/lib/auth-token'
import { requireAdminCtx, requireTeacher } from '@/lib/auth-guard'
import {
  assertArticleInCity,
  assertGroupInCity,
  assertInquiryInCity,
  assertUserInCity,
} from '@/lib/city-guard'
import {
  createAdmin,
  createGroup,
  createInquiry,
  createStudent,
  createTeacher,
} from './helpers/factory'

// PR2 tenant-auth invariants: the JWT city claim, the fail-closed guards, and
// the cross-city 404 row guards. `auth()` is mocked (setup.ts) but
// revalidateTokenClaims lives in @/lib/auth-token, outside the mock — these
// tests exercise the real DB-backed refresh logic the jwt callback delegates
// to.

describe('revalidateTokenClaims', () => {
  it('refreshes a legacy token without a city claim even within the TTL', async () => {
    const admin = await createAdmin()
    const token: TokenClaims = { id: admin.id, role: admin.role, checkedAt: Date.now() }
    const result = await revalidateTokenClaims(token)
    expect(result?.city).toBe('SPLIT')
  })

  it('does not hit the DB for a complete token within the TTL', async () => {
    const admin = await createAdmin()
    const token = {
      id: admin.id,
      role: admin.role,
      city: 'SPLIT' as const,
      checkedAt: Date.now(),
    }
    await db.user.update({ where: { id: admin.id }, data: { city: 'SIBENIK' } })
    const result = await revalidateTokenClaims(token)
    expect(result?.city).toBe('SPLIT') // TTL fresh — old claim kept until expiry
  })

  it('propagates a city flip once the TTL expires (no re-login needed)', async () => {
    const admin = await createAdmin()
    await db.user.update({ where: { id: admin.id }, data: { city: 'SIBENIK' } })
    const token = { id: admin.id, role: admin.role, city: 'SPLIT' as const, checkedAt: 0 }
    const result = await revalidateTokenClaims(token)
    expect(result?.city).toBe('SIBENIK')
  })

  it('kills the session for soft-deleted users', async () => {
    const teacher = await createTeacher({ deletedAt: new Date() })
    const token = { id: teacher.id, role: teacher.role, city: 'SPLIT' as const, checkedAt: 0 }
    expect(await revalidateTokenClaims(token)).toBeNull()
  })
})

describe('fail-closed guards on missing city claim', () => {
  it('requireAdminCtx returns the admin city', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const ctx = await requireAdminCtx()
    expect(ctx.city).toBe('SIBENIK')
    expect(ctx.session.user.id).toBe(admin.id)
  })

  it('rejects an admin session without a city claim', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', city: null })
    await expect(requireAdminCtx()).rejects.toThrow()
  })

  it('rejects a teacher session without a city claim', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER', city: null })
    await expect(requireTeacher()).rejects.toThrow()
  })
})

describe('city-guard cross-city 404s', () => {
  it('assertGroupInCity: same-city passes, cross-city and unknown ids 404', async () => {
    const group = await createGroup({ city: 'SPLIT' })
    await expect(assertGroupInCity(group.id, 'SPLIT')).resolves.toBeUndefined()
    await expect(assertGroupInCity(group.id, 'SIBENIK')).rejects.toThrow()
    await expect(assertGroupInCity('nonexistent', 'SPLIT')).rejects.toThrow()
  })

  it('assertUserInCity: same-city passes, cross-city 404s', async () => {
    const student = await createStudent({ city: 'SIBENIK' })
    await expect(assertUserInCity(student.id, 'SIBENIK')).resolves.toBeUndefined()
    await expect(assertUserInCity(student.id, 'SPLIT')).rejects.toThrow()
  })

  it('assertInquiryInCity: same-city passes, cross-city 404s', async () => {
    const inquiry = await createInquiry({ city: 'SIBENIK' })
    await expect(assertInquiryInCity(inquiry.id, 'SIBENIK')).resolves.toBeUndefined()
    await expect(assertInquiryInCity(inquiry.id, 'SPLIT')).rejects.toThrow()
  })

  it('assertArticleInCity: same-city passes, cross-city 404s', async () => {
    const admin = await createAdmin()
    const article = await db.article.create({
      data: {
        slug: `city-guard-test-${Date.now()}`,
        title: 'Testni članak',
        authorId: admin.id,
        city: 'SPLIT',
      },
    })
    await expect(assertArticleInCity(article.id, 'SPLIT')).resolves.toBeUndefined()
    await expect(assertArticleInCity(article.id, 'SIBENIK')).rejects.toThrow()
    await db.article.delete({ where: { id: article.id } })
  })
})
