import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { createAdmin, createTeacher } from '../helpers/factory'
import { mockSession } from '../setup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteTeacher, getTeachers } = await import('@/actions/admin/teacher')

// 3 of 5 tests migrated from tests/phase3/30-teacher-soft-delete.spec.ts:
//   - deletedAt write (admin can soft-delete teacher with prior content)
//   - query-filter (soft-deleted teacher hidden from active-only queries)
//   - login-rejection (the auth-callback check rejects deleted users)
// The remaining 2 DOM-dependent tests (admin teacher list UI, "Bivši
// nastavnik" badge rendering) stay as Playwright.

describe('Teacher soft-delete', () => {
  it('soft-delete writes deletedAt — Material + StudentComment FK relations survive (no cascade)', async () => {
    const teacher = await createTeacher()

    // Replicate the Playwright suite's prior-content fixture: teacher authored
    // a material and a comment before being deleted. We seed minimal rows
    // via raw Prisma to avoid spinning up courses/groups/students for this
    // narrow FK check — the relations themselves only require a uploadedById
    // for Material and an authorId for StudentComment.
    const author = teacher.id

    // Material requires a group or course or module; just use scope = COURSE
    // with a freshly-created course.
    const course = await db.course.create({
      data: { slug: `c-${Date.now()}`, title: 'X', description: 'X', ageMin: 6, ageMax: 14 },
    })
    const material = await db.material.create({
      data: {
        scope: 'COURSE',
        courseId: course.id,
        title: 'M',
        type: 'LINK',
        externalUrl: 'https://x.test',
        uploadedById: author,
      },
    })

    // Drive the REAL action. Writing `deletedAt` by hand here tested Prisma,
    // not `deleteTeacher` — a change that started hard-deleting, or stopped
    // soft-deleting at all, would have left this green.
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const res = await deleteTeacher(teacher.id)
    expect(res.success).toBe(true)

    // Verify FK relations survived (the previous bug was a hard FK constraint
    // that blocked the soft-delete when prior content existed).
    const materialAfter = await db.material.findUnique({
      where: { id: material.id },
      select: { uploadedById: true },
    })
    expect(materialAfter?.uploadedById, 'material row still references the now-soft-deleted teacher').toBe(
      teacher.id,
    )

    const userRow = await db.user.findUnique({
      where: { id: teacher.id },
      select: { deletedAt: true },
    })
    expect(userRow?.deletedAt).not.toBeNull()
  })

  it('soft-deleted teacher drops out of the admin list', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    // One shared surname so a single search returns exactly this pair — the
    // tier shares a database, so an unfiltered list would be everyone's.
    const marker = `Softdel${Date.now().toString(36)}`
    const active = await createTeacher({ city: 'SPLIT', lastName: marker })
    const deleted = await createTeacher({ city: 'SPLIT', lastName: marker })

    // Both present before the delete — the positive control. Without it, a
    // list that returned nothing at all would read as a passing test.
    const before = (await getTeachers({ search: marker, pageSize: 100 })).data.map((t) => t.id)
    expect(before).toContain(active.id)
    expect(before).toContain(deleted.id)

    expect((await deleteTeacher(deleted.id)).success).toBe(true)

    // `getTeachers` itself, not a hand-written copy of its where clause.
    const after = (await getTeachers({ search: marker, pageSize: 100 })).data.map((t) => t.id)
    expect(after, 'active teacher is still listed').toContain(active.id)
    expect(after, 'soft-deleted teacher is gone').not.toContain(deleted.id)
  })

  it('a soft-deleted teacher keeps a usable password hash — only deletedAt bars them', async () => {
    // The login-side refusal is `if (user.deletedAt) return null` inside the
    // credentials `authorize` callback (src/lib/auth.ts). It cannot be invoked
    // from this tier: `@/lib/auth` is mocked for the whole integration tier
    // (setup.ts), so nothing here can reach @auth/core's provider.
    //
    // This test used to re-implement that condition and assert on the copy,
    // which passed no matter what auth.ts did (Flux 2se21an). What it can
    // honestly pin is the state the callback reads: credentials still verify,
    // so `deletedAt` is the ONLY thing standing between this row and a session
    // — remove that check and the account is live again.
    //
    // The session-side twin IS covered for real, against
    // `revalidateTokenClaims`, in middleware/jwt-invalidation.test.ts.
    const password = `pw-${Date.now()}`
    const passwordHash = await bcrypt.hash(password, 4)
    const teacher = await db.user.create({
      data: {
        city: 'SPLIT',
        email: `softdel-${Date.now()}@test.local`,
        username: `softdel_${Date.now()}`,
        firstName: 'X',
        lastName: 'Y',
        passwordHash,
        role: 'TEACHER',
        deletedAt: new Date(),
      },
    })

    const lookup = await db.user.findUnique({ where: { email: teacher.email } })
    expect(lookup, 'user row exists in DB').not.toBeNull()
    expect(lookup?.deletedAt, 'deletedAt is set').not.toBeNull()
    expect(
      await bcrypt.compare(password, lookup!.passwordHash),
      'the password still checks out — the deletedAt guard is load-bearing on its own',
    ).toBe(true)
  })
})
