import { test, expect } from '@playwright/test'
import { BASE, loginAsAdmin, loginWithEmail, createTeacher, type TeacherData } from '../helpers/phase3'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 — Access-control DOM redirect-flow slice (Flux a69o3ew slim).
// The 10 headless ACs (API role rejection, requireXxx guard bounces, teacher
// 404 on others' group, server-action authz, etc.) live at
// tests/integration/api/access-control.test.ts. This file keeps the 5 tests
// that exercise the actual browser-side redirect + login-form rendering:
//   1. unauth /portal redirects to /prijava (full DOM nav)
//   2. unauth /admin redirects to /prijava (full DOM nav)
//   3. unauth /nastavnik redirects to /prijava (full DOM nav)
//   4. login form shows Croatian error on invalid credentials (DOM toast)
//   5. teacher login routing redirect to /nastavnik (DOM nav post-login)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = Date.now().toString().slice(-6)

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
  test('unauthenticated visitor is redirected from gated roots to /prijava', async ({ page }) => {
    for (const route of ['/portal', '/admin', '/nastavnik']) {
      await test.step(`Unauth GET ${route} → redirected to /prijava`, async () => {
        await page.goto(`${BASE}${route}`)
        await page.waitForURL(/\/prijava/, { timeout: 30000 })
        expect(page.url(), `unauth visit to ${route} ended on /prijava`).toContain('/prijava')
      })
    }
  })

  test('login form shows Croatian error message on invalid credentials', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
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
  })
})
