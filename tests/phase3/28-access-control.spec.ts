import { test, expect } from '@playwright/test'
import { BASE, loginAsAdmin, loginWithEmail, createTeacher, type TeacherData } from '../helpers/phase3'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 — Access-control DOM redirect-flow slice (Flux a69o3ew slim).
// The headless ACs (API role rejection, requireXxx guard bounces, teacher
// 404 on others' group) live at tests/integration/api/access-control.test.ts;
// the createTeacherComment / deleteTeacherComment server-action authz lives
// at tests/integration/api/teacher-comment.test.ts. This file keeps the 5
// tests that exercise the actual browser-side redirect + login-form rendering:
//   1. unauth /portal renders the login screen in place (it IS the sign-in URL)
//   2. unauth /admin redirects to /portal (full DOM nav)
//   3. unauth /nastavnik redirects to /portal (full DOM nav)
//   4. login form shows Croatian error on invalid credentials (DOM toast)
//   5. teacher login routing redirect to /nastavnik (DOM nav post-login)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = newRunId()

// Teardown: every fixture this spec creates carries RUN_ID in its name, e-mail or
// title, so one call removes exactly this run's rows and can reach no other.
// Without it each run's groups stay for good, and `/admin/grupe` packs a
// weekday's groups into one lane — past a few dozen leftovers the entries go
// zero-width and specs that never changed start failing on the litter.
// Best-effort by design: it swallows, so a teardown problem can never turn a
// green run red.
test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

const TEACHER: TeacherData = {
  firstName: 'Roko',
  lastName: `ACL${RUN_ID}`,
  email: `roko.acl.${RUN_ID}@test.com`,
  phone: '0915550001',
}

type Seeded = {
  teacher: { email: string; password: string }
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — Access-control DOM redirect flows', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const t = await createTeacher(page, TEACHER)
    seeded = { teacher: { email: TEACHER.email, password: t.password } }
    await page.close()
  })

  // Parametrized loop over the 3 role-gated routes (Flux cvyxnhq merge —
  // was 3 separate tests). Each route still gets its own assertion message
  // via `test.step()` so failures pinpoint which route stopped redirecting.
  // /portal itself is the sign-in URL: it renders the login screen in place
  // instead of redirecting (bouncing it would loop).
  test('unauthenticated visitor ends on the /portal login screen from every gated root', async ({ page }) => {
    await test.step('Unauth GET /portal → login screen rendered in place', async () => {
      await page.goto(`${BASE}/portal`)
      await expect(page.locator('h1')).toHaveText('Prijava')
      expect(page.url(), 'unauth visit to /portal stays on /portal').toContain('/portal')
    })
    for (const route of ['/admin', '/nastavnik']) {
      await test.step(`Unauth GET ${route} → redirected to /portal`, async () => {
        await page.goto(`${BASE}${route}`)
        await page.waitForURL(/\/portal/, { timeout: 30000 })
        expect(page.url(), `unauth visit to ${route} ended on /portal`).toContain('/portal')
        await expect(page.locator('h1')).toHaveText('Prijava')
      })
    }
  })

  test('login form shows Croatian error message on invalid credentials', async ({ page }) => {
    await page.goto(`${BASE}/portal`)
    await page.locator('#identifier').fill('nonexistent@test.com')
    await page.locator('input[type="password"]').fill('wrongpassword123')
    await page.locator('button[type="submit"]').click()
    await expect(
      page.getByText(/Pogrešno korisničko ime ili lozinka/),
    ).toBeVisible({ timeout: 10000 })
  })

  test('teacher login routes to /nastavnik (post-login redirect)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    expect(page.url()).toContain('/nastavnik')
    // The admin-panel switcher in the teacher header is admin-only — a plain
    // TEACHER must not see it.
    await expect(page.getByRole('link', { name: 'Administracija' })).toHaveCount(0)
  })
})
