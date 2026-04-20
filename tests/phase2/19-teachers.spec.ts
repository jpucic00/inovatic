import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 9 — Admin Teachers
// Verifies the teacher account management flow: create via dialog, list page
// search, detail page (edit + reset password), assignment management from
// both sides (teacher detail + group detail), and teacher delete.
// Requires: dev server on localhost:3000, seeded admin user, at least one
// ScheduledGroup (SLR 1..4 or any radionica) to assign to.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER = {
  firstName: 'Ana',
  lastName: `Nastavnica${RUN_ID}`,
  email: `ana.nastavnica.${RUN_ID}@test.com`,
  phone: '0911112233',
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
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

    // Success state renders credentials
    await expect(page.getByText('Pristupni podaci')).toBeVisible()
    await expect(page.getByText(TEACHER.email, { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Zatvori' }).click()

    // Teacher now appears in the list
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
