import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
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

// ── The token-eviction layer ────────────────────────────────────────────────
// This is what ejects a student who was ALREADY logged in when their last
// enrollment left the window; without it a cookie minted on 31 August stays
// valid into late September (@auth/core's 30-day JWT default).

function staleToken(id: string) {
  // `city` present + an expired checkedAt forces the DB re-check path.
  return { id, role: 'STUDENT' as const, city: 'SPLIT' as const, checkedAt: 0 }
}

describe('revalidateTokenClaims — student activity', () => {
  it('keeps a student with a current-year enrollment', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    expect(await revalidateTokenClaims(staleToken(student.id))).not.toBeNull()
  })

  it('keeps a student enrolled only for NEXT year', async () => {
    const { student } = await studentEnrolledIn(NEXT)
    expect(await revalidateTokenClaims(staleToken(student.id))).not.toBeNull()
  })

  it('evicts a student whose only enrollment is in a past year', async () => {
    const { student } = await studentEnrolledIn(PAST)
    expect(await revalidateTokenClaims(staleToken(student.id))).toBeNull()
  })

  it('evicts a student with no enrollment at all', async () => {
    const student = await createStudent({ city: 'SPLIT' })
    expect(await revalidateTokenClaims(staleToken(student.id))).toBeNull()
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
   * transient DB errors still covers it — a Neon cold start must not log out the
   * entire student body at once.
   */
  it('fails OPEN on a transient DB error rather than evicting everyone', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    const spy = vi
      .spyOn(db.enrollment, 'count')
      .mockRejectedValueOnce(new Error('connection reset'))

    const token = await revalidateTokenClaims(staleToken(student.id))
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
 * difference is the whole point: `requireActiveStudent` must 404, because
 * `requireStudent`'s `redirect('/portal')` would bounce a student to the page
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
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expect(getEffectiveMaterialsForStudent(group.id)).resolves.toBeTruthy()
  })

  /**
   * The digest matters, not just "it threw". `requireActiveStudent` must fail
   * with `notFound()` and NOT `requireStudent`'s `redirect('/portal')`: /portal
   * renders the dashboard for a STUDENT session, so bouncing there would loop
   * forever. Both throw, so a bare `.rejects.toThrow()` is blind to exactly the
   * regression `auth-guard.ts` documents.
   */
  it('refuses materials to a student whose enrollment is only in a past year', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expectNotFound(getEffectiveMaterialsForStudent(group.id))
  })

  it('refuses the gallery to the same student', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expectNotFound(getGroupGalleryForStudent(group.id))
  })

  /**
   * The portal report card is the parent-visible surface, and it runs the same
   * guard — it was the one `requireActiveStudent` caller nothing exercised.
   */
  it('refuses the portal evaluation to the same student', async () => {
    const { student, group } = await studentEnrolledIn(PAST)
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

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
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

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
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    const rows = await getMyCurrentEnrollments()
    expect(rows.map((r) => r.group.id)).toContain(group.id)
  })

  it('does not show a past-year enrollment', async () => {
    const { student } = await studentEnrolledIn(CURRENT)
    const oldGroup = await groupIn(PAST)
    await createEnrollment(student.id, oldGroup.id, { schoolYear: PAST })
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    const rows = await getMyCurrentEnrollments()
    expect(rows.map((r) => r.group.id)).not.toContain(oldGroup.id)
  })
})
