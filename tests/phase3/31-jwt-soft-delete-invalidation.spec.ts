import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  createTeacher,
  assignTeacherToGroup,
  type TeacherData,
} from '../helpers/phase3'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JWT invalidation on soft-delete (Flux 7m98hdx) — verifies a live teacher
// session is rejected on the next request after admin soft-deletes.
//
// The instant-rejection path is the belt-and-suspenders `deletedAt` check
// inside `assertTeacherOwnsGroup` (added alongside the jwt-callback TTL).
// Group-scoped routes hit that check on the very next request, so we don't
// need to wait for the 60s jwt-callback TTL to elapse.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Eva',
  lastName: `JwtInv${RUN_ID}`,
  email: `eva.jwtinv.${RUN_ID}@test.com`,
  phone: '0917770099',
}

type Seeded = {
  teacherId: string
  password: string
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('JWT invalidation on soft-delete (7m98hdx)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupId] = collectGroupIds(page, 1)
    const t = await createTeacher(page, TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)

    seeded = { teacherId: t.teacherId, password: t.password, groupId }
    await page.close()
  })

  test('logged-in teacher is booted to /prijava on the next request after admin soft-deletes', async ({
    browser,
  }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')

    const teacherCtx = await browser.newContext()
    const adminCtx = await browser.newContext()
    try {
      const teacherPage = await teacherCtx.newPage()
      const adminPage = await adminCtx.newPage()

      // Context A: teacher logs in and reaches a teacher-gated group route.
      await loginWithEmail(teacherPage, TEACHER.email, seeded.password)
      await teacherPage.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await teacherPage.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)
      await expect(teacherPage).toHaveURL(
        new RegExp(`/nastavnik/grupa/${seeded.groupId}/materijali`),
        { timeout: 15000 },
      )

      // Context B: admin soft-deletes the teacher via the danger zone.
      await loginAsAdmin(adminPage)
      await adminPage.goto(`${BASE}/admin/nastavnici/${seeded.teacherId}`)
      await adminPage.getByRole('button', { name: 'Obriši nastavnika' }).click()
      await adminPage.getByRole('button', { name: 'Obriši trajno' }).click()
      await adminPage.waitForURL(`${BASE}/admin/nastavnici`, { timeout: 15000 })

      // Context A: re-navigating to the same group route now bounces to
      // /prijava. The deletedAt check inside assertTeacherOwnsGroup fires on
      // this very request — no need to wait for the 60s jwt-callback TTL.
      await teacherPage.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)
      await expect(teacherPage).toHaveURL(/\/prijava/, { timeout: 15000 })
    } finally {
      await teacherCtx.close()
      await adminCtx.close()
    }
  })
})
