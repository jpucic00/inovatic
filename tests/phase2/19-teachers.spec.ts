import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin as sharedLoginAsAdmin } from '../helpers/phase3'

import { cleanupRunFixtures } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 9 — Admin Teachers
// Verifies the teacher account management flow: create via dialog, list page
// search, detail page (edit + reset password), assignment management from
// both sides (teacher detail + group detail), and teacher delete.
// Requires: dev server on localhost:3000, seeded admin user, at least one
// ScheduledGroup (SLR 1..4 or any radionica) to assign to.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const RUN_ID = Date.now().toString().slice(-6)

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

const TEACHER = {
  firstName: 'Ana',
  lastName: `Nastavnica${RUN_ID}`,
  email: `ana.nastavnica.${RUN_ID}@test.com`,
  phone: '0911112233',
}

// Delegates to the shared panel-aware helper: the seeded admin can hold a
// TeacherAssignment, which turns login into the dual-role panel chooser —
// driving the form here and waiting for /admin hangs on a login that
// actually SUCCEEDED (see .claude/validate.md decisions log, 2026-07-27).
async function loginAsAdmin(page: Page) {
  await sharedLoginAsAdmin(page)
  await page.waitForLoadState('networkidle')
}

test.describe.configure({ mode: 'serial' })

test.describe('Admin — Teachers', () => {
  test('create teacher from list page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici`)
    await expect(page.getByRole('heading', { name: 'Nastavnici' })).toBeVisible()

    await page.getByRole('button', { name: 'Kreiraj nastavnika' }).click()

    await page.locator('#teacher-email').fill(TEACHER.email)
    await page.locator('#teacher-first').fill(TEACHER.firstName)
    await page.locator('#teacher-last').fill(TEACHER.lastName)
    await page.locator('#teacher-phone').fill(TEACHER.phone)
    await page.getByRole('button', { name: /Kreiraj nastavnika/ }).click()

    // Success state renders credentials. Exact matches avoid strict-mode
    // violations: "Pristupni podaci" also appears inside a longer
    // DialogDescription sentence, and the email shows up twice (inside a
    // <strong> on its own, and as part of "E-mail: {email}").
    // The server action sends the credentials email via Resend, which can
    // take a few seconds on a cold dev server — bump past the 5s default.
    await expect(page.getByText('Pristupni podaci', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(TEACHER.email, { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Zatvori' }).click()

    // Teacher list is alphabetically ordered + paginated (20/page); once the dev
    // DB accumulates enough rows, a new lastName like "Nastavnica<RUN_ID>" lands
    // beyond page 1. Navigate via search to make this resilient to pagination.
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await expect(page.getByText(`${TEACHER.firstName} ${TEACHER.lastName}`)).toBeVisible()
  })

  test('search list page by last name', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await expect(page.getByText(`${TEACHER.firstName} ${TEACHER.lastName}`)).toBeVisible()
  })

  test('edit teacher name from detail page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await page.getByRole('link', { name: `${TEACHER.firstName} ${TEACHER.lastName}` }).first().click()

    await page.getByRole('button', { name: 'Uredi' }).click()
    const newFirst = 'Ana-Marija'
    await page.locator('#edit-teacher-first').fill(newFirst)
    await page.getByRole('button', { name: /Spremi/ }).click()

    // Back on detail page, heading should show new name
    await expect(page.getByRole('heading', { level: 1 })).toContainText(newFirst)
  })

  test('assign teacher to group and remove', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await page.getByRole('link', { name: new RegExp(TEACHER.lastName) }).first().click()

    // Add assignment
    await page.getByRole('button', { name: /Dodijeli grupu/ }).click()
    const select = page.locator('#assign-group-select')
    await expect(select).toBeVisible()

    // Pick the first non-placeholder option
    const optionCount = await select.locator('option').count()
    expect(optionCount).toBeGreaterThan(1)
    const firstGroupValue = await select.locator('option').nth(1).getAttribute('value')
    if (!firstGroupValue) throw new Error('No group available to assign')
    await select.selectOption(firstGroupValue)
    await page.getByRole('button', { name: /^Dodijeli$/ }).click()

    // Assignment appears in the list
    await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible()

    // Remove it
    await page.locator('button[aria-label="Ukloni dodjelu"]').first().click()
    await expect(page.getByText('Još nema dodijeljenih grupa.')).toBeVisible({ timeout: 5000 })
  })

  test('delete teacher from danger zone', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await page.getByRole('link', { name: new RegExp(TEACHER.lastName) }).first().click()

    await page.getByRole('button', { name: 'Obriši nastavnika' }).click()
    await page.getByRole('button', { name: 'Obriši trajno' }).click()

    // Redirects back to list; search should now be empty
    await page.waitForURL(`${BASE}/admin/nastavnici`, { timeout: 10000 })
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await expect(page.getByText('Nema nastavnika koji odgovaraju pretrazi.')).toBeVisible()
  })
})
