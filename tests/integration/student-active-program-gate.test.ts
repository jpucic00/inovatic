import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockChildSession, mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createParent,
  createStudent,
  createTeacher,
  linkToParent,
} from './helpers/factory'
import { computeSchoolYear, getNextSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'
import { revalidateTokenClaims } from '@/lib/auth-token'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const CURRENT = computeSchoolYear()
const NEXT = getNextSchoolYear(CURRENT)
const PAST = getPreviousSchoolYear(CURRENT)

const { getEffectiveMaterialsForStudent } = await import('@/actions/student/materials')
const { getGroupGalleryForStudent } = await import('@/actions/student/gallery')
const { getMyCurrentEnrollments } = await import('@/actions/student/dashboard')
const { getMyAssessmentForGroup } = await import('@/actions/student/assessment')

async function groupIn(schoolYear: string) {
  const course = await createCourse({ kind: 'STANDARD' })
  return createGroup({ courseId: course.id, schoolYear, city: 'SPLIT' })
}

/** A student enrolled only in the given year. */
async function studentEnrolledIn(schoolYear: string) {
  const student = await createStudent({ city: 'SPLIT' })
  const group = await groupIn(schoolYear)
  await createEnrollment(student.id, group.id, { schoolYear })
  return { student, group }
}

/** A parent account whose one child is enrolled only in the given year. */
async function parentOfChildIn(schoolYear: string) {
  const parent = await createParent({ city: 'SPLIT' })
  const { student } = await studentEnrolledIn(schoolYear)
  await linkToParent(student.id, parent.id)
  return { parent, student }
}

// ── The token-eviction layer ────────────────────────────────────────────────
// This is what ejects a parent who was ALREADY logged in when their last child
// left the window; without it a cookie minted on 31 August stays valid into
// late September (@auth/core's 30-day JWT default).

function staleToken(id: string, role: 'PARENT' | 'STUDENT' = 'PARENT', studentId?: string) {
  // `city` present + an expired checkedAt forces the DB re-check path.
  return { id, role, city: 'SPLIT' as const, checkedAt: 0, ...(studentId ? { studentId } : {}) }
}

describe('revalidateTokenClaims — family sessions', () => {
  it('keeps a parent whose child has a current-year enrollment', async () => {
    const { parent } = await parentOfChildIn(CURRENT)
    expect(await revalidateTokenClaims(staleToken(parent.id))).not.toBeNull()
  })

  it('keeps a parent whose child is enrolled only for NEXT year', async () => {
    const { parent } = await parentOfChildIn(NEXT)
    expect(await revalidateTokenClaims(staleToken(parent.id))).not.toBeNull()
  })

  it('evicts a parent whose only child is enrolled only in a past year', async () => {
    const { parent } = await parentOfChildIn(PAST)
    expect(await revalidateTokenClaims(staleToken(parent.id))).toBeNull()
  })

  it('evicts a parent with no linked child at all', async () => {
    const parent = await createParent({ city: 'SPLIT' })
    expect(await revalidateTokenClaims(staleToken(parent.id))).toBeNull()
  })

  it('ends a leftover STUDENT token even for an actively enrolled child', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    expect(await revalidateTokenClaims(staleToken(student.id, 'STUDENT'))).toBeNull()
  })

  it('keeps the picked child while the parent may still open it', async () => {
    const { parent, student } = await parentOfChildIn(CURRENT)
    const token = await revalidateTokenClaims(staleToken(parent.id, 'PARENT', student.id))
    expect(token?.studentId).toBe(student.id)
  })

  it('drops the picked child — but not the session — once it moves to the other parent', async () => {
    const { parent, student } = await parentOfChildIn(CURRENT)
    await linkToParent((await studentEnrolledIn(CURRENT)).student.id, parent.id)
    const otherParent = await createParent({ city: 'SPLIT' })
    await linkToParent(student.id, otherParent.id)

    const token = await revalidateTokenClaims(staleToken(parent.id, 'PARENT', student.id))
    expect(token).not.toBeNull()
    expect(token?.studentId).toBeUndefined()
  })

  it('drops a picked child that is deleted', async () => {
    const { parent, student } = await parentOfChildIn(CURRENT)
    await linkToParent((await studentEnrolledIn(CURRENT)).student.id, parent.id)
    await db.user.update({ where: { id: student.id }, data: { deletedAt: new Date() } })

    const token = await revalidateTokenClaims(staleToken(parent.id, 'PARENT', student.id))
    expect(token?.studentId).toBeUndefined()
  })

  it('never evicts an admin or a teacher, however they are enrolled', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })

    expect(
      await revalidateTokenClaims({
        id: admin.id,
        role: 'ADMIN' as const,
        city: 'SPLIT' as const,
        checkedAt: 0,
      }),
    ).not.toBeNull()
    expect(
      await revalidateTokenClaims({
        id: teacher.id,
        role: 'TEACHER' as const,
        city: 'SPLIT' as const,
        checkedAt: 0,
      }),
    ).not.toBeNull()
  })

  /**
   * The check lives INSIDE the existing try so the deliberate fail-open on
   * transient DB errors still covers it — a Neon cold start must not log out
   * every family at once.
   */
  it('fails OPEN on a transient DB error rather than evicting everyone', async () => {
    const { parent } = await parentOfChildIn(CURRENT)
    const spy = vi.spyOn(db.user, 'count').mockRejectedValueOnce(new Error('connection reset'))

    const token = await revalidateTokenClaims(staleToken(parent.id))
    expect(token).not.toBeNull()
    spy.mockRestore()
  })
})

// ── The data gates ──────────────────────────────────────────────────────────
// Defence in depth for the ≤60s window before eviction runs: these routes
// authorise off a session, so the rule has to hold here too.

/**
 * Asserts a guard refused with `notFound()` and not `redirect()`.
 *
 * Both throw, so a bare `.rejects.toThrow()` cannot tell them apart — and the
 * difference is the whole point: `requireActivePortalChild` must 404, because
 * `requirePortalChild`'s `redirect('/portal')` would bounce a family to the page
 * that renders their dashboard and loop forever. Matched on the 404 half of the
 * digest rather than the exact string, which Next has already renamed once
 * (`NEXT_NOT_FOUND` → `NEXT_HTTP_ERROR_FALLBACK;404`); a redirect digest starts
 * `NEXT_REDIRECT` and never matches either way.
 */
async function expectNotFound(p: Promise<unknown>): Promise<void> {
  await expect(p).rejects.toMatchObject({
    digest: expect.stringMatching(/^NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)$/),
  })
}

describe('portal reads require an active program', () => {
  it('serves materials to an actively enrolled student', async () => {
    const { student, group } = await studentEnrolledIn(CURRENT)
    mockChildSession(student.id)

    await expect(getEffectiveMaterialsForStudent(group.id)).resolves.toBeTruthy()
  })

  /**
   * The digest matters, not just "it threw". `requireActivePortalChild` must
   * fail with `notFound()` and NOT `requirePortalChild`'s `redirect('/portal')`:
   * /portal renders the dashboard for a session holding a child, so bouncing there would loop
   * forever. Both throw, so a bare `.rejects.toThrow()` is blind to exactly the
   * regression `auth-guard.ts` documents.
   */
  it('refuses materials to a student whose enrollment is only in a past year', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockChildSession(student.id)

    await expectNotFound(getEffectiveMaterialsForStudent(group.id))
  })

  it('refuses the gallery to the same student', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockChildSession(student.id)

    await expectNotFound(getGroupGalleryForStudent(group.id))
  })

  /**
   * The portal report card is the parent-visible surface, and it runs the same
   * guard — it was the one `requireActivePortalChild` caller nothing exercised.
   */
  it('refuses the portal evaluation to the same student', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockChildSession(student.id)

    await expectNotFound(getMyAssessmentForGroup(group.id))
  })

  /**
   * The gate asks whether the CALLER is active, not whether the requested group
   * is this year's. A currently-enrolled child looking back at their own
   * previous group is legitimate — year-filtering the per-group lookup would
   * quietly withdraw the parent-visible evaluation decided in July 2026.
   */
  it('still serves an ACTIVE student their own previous-year group', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    const oldGroup = await groupIn(PAST)
    await createEnrollment(student.id, oldGroup.id, { schoolYear: PAST })
    mockChildSession(student.id)

    await expect(getEffectiveMaterialsForStudent(oldGroup.id)).resolves.toBeTruthy()
  })
})

describe('dashboard year window', () => {
  /**
   * The July case: accounts for next year are created over the summer and the
   * credentials campaign runs then. Filtering on computeSchoolYear() alone let
   * such a child log in and be shown an empty dashboard.
   */
  it('shows a next-year-only enrollment rather than an empty dashboard', async () => {
    const { student, group } = await studentEnrolledIn(NEXT)
    mockChildSession(student.id)

    const rows = await getMyCurrentEnrollments()
    expect(rows.map((r) => r.group.id)).toContain(group.id)
  })

  it('does not show a past-year enrollment', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    const oldGroup = await groupIn(PAST)
    await createEnrollment(student.id, oldGroup.id, { schoolYear: PAST })
    mockChildSession(student.id)

    const rows = await getMyCurrentEnrollments()
    expect(rows.map((r) => r.group.id)).not.toContain(oldGroup.id)
  })
})
