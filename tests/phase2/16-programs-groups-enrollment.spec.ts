import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 7 — Programs, Groups & Enrollment
// Tests run serially: admin creates a radionica + groups, then public form
// submissions fill those groups, testing spot reservation/release logic.
//
// Scenarios covered:
//   A) Admin creates a radionica (custom course) via UI
//   B) Admin creates a standard (SLR 1) group + radionica group, both with 2 spots
//   C) Public form at /upisi uses new split-name + DOB-dropdown fields
//   D) Submitting 2 inquiries fills a group → "(Popunjeno)" in dropdown
//   E) Admin declines an inquiry → spot is freed in the dropdown
//   F) Admin GDPR-deletes an inquiry → spot is freed in the dropdown
//   G) Public radionica form at /radionice/[slug] hides grade, shows radionica groups
//   H) Radionica group fills up and shows "(Popunjeno)" on the radionica page
//
// Requires: dev server on localhost:3000, seeded admin user, at least 1 active location.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

// Unique per run so test data is identifiable and doesn't collide between runs
const RUN_ID = Date.now().toString().slice(-6)

// Radionica created in admin, then tested on the public /radionice/[slug] page.
// Slug is computed to match the server-side slugify algorithm in createCourse.
const RADIONICA_TITLE = `Testna Radionica ${RUN_ID}`
const RADIONICA_SLUG = `testna-radionica-${RUN_ID}`

// Group names (used to identify options in dropdowns)
const STD_GROUP_NAME = `Test Grupa STD ${RUN_ID}`
const RADIONICA_GROUP_NAME = `Test Grupa RAD ${RUN_ID}`

// Max spots — small so we can fill the group quickly in tests
const MAX_SPOTS = 2

// Parent data for standard-program inquiries
const PARENT_1 = {
  parentName: `Pero Perić ${RUN_ID}`,
  parentEmail: `pero.${RUN_ID}@test.hr`,
  parentPhone: '0911111111',
  childFirstName: 'Ivo',
  childLastName: 'Perić',
}

const PARENT_2 = {
  parentName: `Kata Katić ${RUN_ID}`,
  parentEmail: `kata.${RUN_ID}@test.hr`,
  parentPhone: '0922222222',
  childFirstName: 'Maja',
  childLastName: 'Katić',
}

const PARENT_3 = {
  parentName: `Jure Jurić ${RUN_ID}`,
  parentEmail: `jure.${RUN_ID}@test.hr`,
  parentPhone: '0933333333',
  childFirstName: 'Nela',
  childLastName: 'Jurić',
}

// Used to verify full/available state from a neutral perspective
const PARENT_4 = {
  parentName: `Zora Zorić ${RUN_ID}`,
  parentEmail: `zora.${RUN_ID}@test.hr`,
  parentPhone: '0944444444',
  childFirstName: 'Lana',
  childLastName: 'Zorić',
}

// Parent data for radionica inquiries
const RAD_PARENT_1 = {
  parentName: `Mara Marić ${RUN_ID}`,
  parentEmail: `mara.${RUN_ID}@test.hr`,
  parentPhone: '0955555555',
  childFirstName: 'Tin',
  childLastName: 'Marić',
}

const RAD_PARENT_2 = {
  parentName: `Ivo Ivić ${RUN_ID}`,
  parentEmail: `ivo.${RUN_ID}@test.hr`,
  parentPhone: '0966666666',
  childFirstName: 'Eva',
  childLastName: 'Ivić',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

type ParentData = typeof PARENT_1

async function fillStep1(page: Page, data: ParentData) {
  await page.locator('#parentName').fill(data.parentName)
  await page.locator('#parentEmail').fill(data.parentEmail)
  await page.locator('#parentPhone').fill(data.parentPhone)
  await page.locator('button', { hasText: 'Dalje' }).click()
}

async function fillStep2(page: Page, data: ParentData) {
  await expect(page.locator('#childFirstName')).toBeVisible({ timeout: 5000 })
  await page.locator('#childFirstName').fill(data.childFirstName)
  await page.locator('#childLastName').fill(data.childLastName)

  // Date of birth — three unlabelled selects inside the "Datum rođenja" wrapper.
  // The label contains the text; .locator('..') walks up to the wrapper div.
  const dobWrapper = page.locator('label', { hasText: 'Datum rođenja' }).locator('..')
  await dobWrapper.locator('select').nth(0).selectOption('15')   // Dan
  await dobWrapper.locator('select').nth(1).selectOption('06')   // Mjesec (Lipanj)
  await dobWrapper.locator('select').nth(2).selectOption('2018') // Godina

  await page.locator('button', { hasText: 'Dalje' }).click()
}

async function reachStep3(page: Page, data: ParentData, url = `${BASE}/upisi`) {
  await page.goto(url)
  await fillStep1(page, data)
  await fillStep2(page, data)
  await expect(page.locator('input[name="consent"]')).toBeVisible({ timeout: 5000 })
}

async function selectGroupOption(page: Page, groupName: string) {
  // Find the option whose text contains groupName and select it by value.
  // We can't use selectOption({ label: RegExp }) because Playwright types only
  // accept string labels. Instead we grab the value from the matching option element.
  const optEl = page.locator('#scheduledGroupId option', { hasText: groupName }).first()
  const val = await optEl.getAttribute('value')
  if (!val) throw new Error(`Group option "${groupName}" not found or is disabled (no value)`)
  await page.locator('#scheduledGroupId').selectOption(val)
}

async function submitWithGroup(
  page: Page,
  data: ParentData,
  gradeValue: string | null,
  groupName: string,
  url = `${BASE}/upisi`,
) {
  await reachStep3(page, data, url)

  if (gradeValue !== null) {
    // Standard form: must select grade first
    await page.locator('#grade').selectOption(gradeValue)
    await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })
  }
  await selectGroupOption(page, groupName)

  await page.locator('input[name="consent"]').check()
  await page.locator('button', { hasText: 'Pošalji upit' }).click()
  await expect(page.locator('text=Upit je poslan!')).toBeVisible({ timeout: 15000 })
}

/** Navigate to the detail page of an inquiry by searching for the parent email */
async function openInquiryDetail(page: Page, email: string) {
  await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(email)}`)
  await expect(page.locator('a', { hasText: 'Detalji' })).toHaveCount(1, { timeout: 10000 })
  await page.locator('a', { hasText: 'Detalji' }).click()
  await page.waitForURL(/\/admin\/upiti\/[a-z0-9]+/)
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe.serial('Phase 2 Step 7 — Programs, Groups & Enrollment', () => {
  test.setTimeout(60000)

  // ── A: Admin creates a radionica ────────────────────────────────────────────

  test.describe('A — Admin: Create Radionica', () => {
    test('programi page loads and shows "Nova radionica" button', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      await expect(page.locator('h1', { hasText: 'Programi' })).toBeVisible()
      await expect(page.locator('button', { hasText: 'Nova radionica' })).toBeVisible()
    })

    test('create radionica dialog opens on button click', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      await page.locator('button', { hasText: 'Nova radionica' }).click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      await expect(page.locator('[role="dialog"]').locator('text=Nova radionica')).toBeVisible()
    })

    test('creating radionica shows it in the table', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      await page.locator('button', { hasText: 'Nova radionica' }).click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()

      const dialog = page.locator('[role="dialog"]')
      await dialog.locator('input[placeholder*="Ljetne"]').fill(RADIONICA_TITLE)
      await dialog.locator('textarea').fill('Opis testne radionice za automatske testove.')
      // ageMin/ageMax defaults (6/14) are fine
      // price must be filled — z.coerce.number().positive() rejects empty string (Number("")=0)
      await dialog.locator('input[placeholder*="80"]').fill('50')
      await dialog.locator('button', { hasText: 'Kreiraj radionicu' }).click()

      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 })
      await expect(page.locator(`text=${RADIONICA_TITLE}`).first()).toBeVisible({ timeout: 10000 })
    })

    test('radionica has a public page at /radionice/[slug]', async ({ page }) => {
      const res = await page.goto(`${BASE}/radionice/${RADIONICA_SLUG}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('h1')).toContainText(RADIONICA_TITLE)
    })

    test('radionica card shows "Kopiraj URL" button', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      // CourseCard (radionica) renders as <div class="...rounded-lg..."> with <h3>{title}</h3>, not a <tr>
      const card = page.locator('div.rounded-lg').filter({
        has: page.getByRole('heading', { level: 3, name: RADIONICA_TITLE }),
      })
      await expect(card.getByRole('button', { name: 'Kopiraj URL' })).toBeVisible()
    })

    test('standard SLR courses cannot be deleted (no delete button)', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      // SLR courses are rendered as ModuleDatesTable cards (div.rounded-lg)
      // with the course title in an <h3>.
      const slr1Card = page.locator('div.rounded-lg').filter({
        has: page.locator('h3', { hasText: 'Robotike 1' }),
      })
      await expect(slr1Card).toBeVisible()
      // No "Obriši" button should appear within a standard course card
      await expect(slr1Card.getByRole('button', { name: /Obriši/ })).toHaveCount(0)
    })
  })

  // ── B: Admin creates groups ──────────────────────────────────────────────────

  test.describe('B — Admin: Create Groups', () => {
    test('grupe page loads and shows "Nova grupa" button', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await expect(page.locator('h1', { hasText: 'Grupe' })).toBeVisible()
      await expect(page.locator('button', { hasText: 'Nova grupa' })).toBeVisible()
    })

    test('create standard group (SLR 1) with 2 max spots', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await page.locator('button', { hasText: 'Nova grupa' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Program — pick SLR 1 course (seed title: "Svijet LEGO Robotike 1").
      const courseSelect = dialog.locator('select').nth(0)
      const slrOpt = courseSelect.locator('option', { hasText: 'Robotike 1' }).first()
      const slrVal = await slrOpt.getAttribute('value')
      await courseSelect.selectOption(slrVal!)

      // Location — pick the first available active location
      const locationSelect = dialog.locator('select').nth(1)
      const locationCount = await locationSelect.locator('option').count()
      expect(locationCount).toBeGreaterThan(1) // must have at least one real option
      await locationSelect.selectOption({ index: 1 })

      // Group name
      await dialog.locator('input[placeholder*="Grupa"]').fill(STD_GROUP_NAME)

      // Standard course: day-of-week select appears (not date input)
      const daySelect = dialog.locator('select').nth(2)
      await daySelect.selectOption('Ponedjeljak')

      await dialog.locator('input[placeholder="19:00"]').fill('17:00')
      await dialog.locator('input[placeholder="20:30"]').fill('18:30')

      // Max students = 2 so we can fill the group quickly
      const maxInput = dialog.locator('input[type="number"][min="1"]')
      await maxInput.fill(String(MAX_SPOTS))

      await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
      await expect(dialog).not.toBeVisible({ timeout: 10000 })
      await expect(page.locator(`text=${STD_GROUP_NAME}`).first()).toBeVisible({ timeout: 10000 })
    })

    test('create radionica group with 2 max spots', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await page.locator('button', { hasText: 'Nova grupa' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Program — select the radionica we just created (exact title match)
      const courseSelect = dialog.locator('select').nth(0)
      const radOpt = courseSelect.locator('option', { hasText: RADIONICA_TITLE }).first()
      const radVal = await radOpt.getAttribute('value')
      await courseSelect.selectOption(radVal!)

      // Location — pick the first available location
      const locationSelect = dialog.locator('select').nth(1)
      const locationCount = await locationSelect.locator('option').count()
      expect(locationCount).toBeGreaterThan(1)
      await locationSelect.selectOption({ index: 1 })

      // Group name
      await dialog.locator('input[placeholder*="Grupa"]').fill(RADIONICA_GROUP_NAME)

      // Radionica course: date input appears instead of day select
      await dialog.locator('input[type="date"]').first().fill('2026-07-15')

      await dialog.locator('input[placeholder="19:00"]').fill('10:00')
      await dialog.locator('input[placeholder="20:30"]').fill('12:00')

      // Max students = 2
      const maxInput = dialog.locator('input[type="number"][min="1"]')
      await maxInput.fill(String(MAX_SPOTS))

      await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
      await expect(dialog).not.toBeVisible({ timeout: 10000 })
      await expect(page.locator(`text=${RADIONICA_GROUP_NAME}`).first()).toBeVisible({ timeout: 10000 })
    })

    test('group table shows enrollment counts and window status', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      // Both groups created above should be visible
      await expect(page.locator(`text=${STD_GROUP_NAME}`).first()).toBeVisible()
      await expect(page.locator(`text=${RADIONICA_GROUP_NAME}`).first()).toBeVisible()
      // Standard group (no enrollment window) should show "Uvijek"
      const stdRow = page.locator('tr', { hasText: STD_GROUP_NAME })
      await expect(stdRow.locator('text=Uvijek')).toBeVisible()
    })
  })

  // ── C: Public form uses new split-name + DOB fields ─────────────────────────

  test.describe('C — Public Form: New Fields (Step 2)', () => {
    test('step 2 shows childFirstName and childLastName, not legacy childName', async ({ page }) => {
      await page.goto(`${BASE}/upisi`)
      await fillStep1(page, PARENT_1)
      await expect(page.locator('#childFirstName')).toBeVisible()
      await expect(page.locator('#childLastName')).toBeVisible()
      // Legacy field should not be present
      await expect(page.locator('#childName')).not.toBeVisible()
    })

    test('step 2 shows three date-of-birth dropdowns (Dan/Mesec/Godina)', async ({ page }) => {
      await page.goto(`${BASE}/upisi`)
      await fillStep1(page, PARENT_1)
      const dobWrapper = page.locator('label', { hasText: 'Datum rođenja' }).locator('..')
      await expect(dobWrapper.locator('select').nth(0)).toBeVisible()
      await expect(dobWrapper.locator('select').nth(1)).toBeVisible()
      await expect(dobWrapper.locator('select').nth(2)).toBeVisible()
    })

    test('step 2 validation blocks submission without first name', async ({ page }) => {
      await page.goto(`${BASE}/upisi`)
      await fillStep1(page, PARENT_1)
      await expect(page.locator('#childFirstName')).toBeVisible()
      // Leave firstName empty, fill lastName + DOB
      await page.locator('#childLastName').fill('Testić')
      const dobWrapper = page.locator('label', { hasText: 'Datum rođenja' }).locator('..')
      await dobWrapper.locator('select').nth(0).selectOption('15')
      await dobWrapper.locator('select').nth(1).selectOption('06')
      await dobWrapper.locator('select').nth(2).selectOption('2018')
      await page.locator('button', { hasText: 'Dalje' }).click()
      // Should stay on step 2 with a validation error
      await expect(page.locator('#childFirstName')).toBeVisible()
    })

    test('step 3 shows mandatory grade dropdown on /upisi', async ({ page }) => {
      await reachStep3(page, PARENT_1)
      await expect(page.locator('#grade')).toBeVisible()
      await expect(page.locator('label', { hasText: 'Razred djeteta' })).toBeVisible()
    })

    test('group dropdown disabled before grade is selected', async ({ page }) => {
      await reachStep3(page, PARENT_1)
      // Grade not yet selected → group select is rendered as disabled placeholder
      await expect(page.locator('select:disabled')).toBeVisible()
    })

    test('selecting grade enables group dropdown and shows SLR 1 groups', async ({ page }) => {
      await reachStep3(page, PARENT_1)
      await page.locator('#grade').selectOption('1') // grade 1 → SLR_1
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })
      // Our test group should appear in the dropdown
      await expect(
        page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME }),
      ).toHaveCount(1)
    })

    test('step 3 validation blocks submission without grade', async ({ page }) => {
      await reachStep3(page, PARENT_1)
      await page.locator('input[name="consent"]').check()
      await page.locator('button', { hasText: 'Pošalji upit' }).click()
      // Should show validation error for the grade field
      await expect(page.locator('#grade')).toBeVisible()
      // Form did not submit (success message absent)
      await expect(page.locator('text=Upit je poslan!')).not.toBeVisible()
    })
  })

  // ── D: Fill up the standard group ───────────────────────────────────────────

  test.describe('D — Public: Filling Up a Standard Group', () => {
    test('parent 1 submits inquiry and selects the standard group (1 of 2 spots)', async ({
      page,
    }) => {
      await submitWithGroup(page, PARENT_1, '1', STD_GROUP_NAME)
    })

    test('parent 2 fills the last spot (2 of 2)', async ({ page }) => {
      await submitWithGroup(page, PARENT_2, '1', STD_GROUP_NAME)
    })

    test('group option shows "(Popunjeno)" after both spots taken', async ({ page }) => {
      await reachStep3(page, PARENT_4)
      await page.locator('#grade').selectOption('1')
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })

      const groupOption = page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME })
      await expect(groupOption).toHaveCount(1)
      await expect(groupOption).toHaveText(/Popunjeno/)
    })

    test('full group option is disabled (cannot be selected)', async ({ page }) => {
      await reachStep3(page, PARENT_4)
      await page.locator('#grade').selectOption('1')
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })

      const groupOption = page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME })
      await expect(groupOption).toHaveAttribute('disabled', '')
    })

    test('admin group detail shows 2 inquiry reservations', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      // Standard groups tab renders with hideProgram=true; Upiti is column index 3
      // (Naziv, Lokacija, Termin, Upiti, Polaznici…)
      const row = page.locator('tr', { hasText: STD_GROUP_NAME })
      await expect(row.locator('td').nth(3)).toHaveText('2')
    })
  })

  // ── E: Declining an inquiry frees a spot ───────────────────────────────────

  test.describe('E — Admin: Decline Inquiry Frees a Spot', () => {
    test('admin can find and decline parent 1 inquiry', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, PARENT_1.parentEmail)
      await page.locator('button', { hasText: 'Odbij upit' }).click()
      await expect(page.locator('text=Odbiti upit?')).toBeVisible()
      await page.locator('[role="dialog"] button', { hasText: 'Odbij upit' }).last().click()
      await expect(page.locator('span', { hasText: 'Odbijena' }).first()).toBeVisible({
        timeout: 10000,
      })
    })

    test('after decline, group shows 1 available spot again', async ({ page }) => {
      await reachStep3(page, PARENT_4)
      await page.locator('#grade').selectOption('1')
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })

      const groupOption = page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME })
      await expect(groupOption).toHaveCount(1)
      await expect(groupOption).not.toHaveText(/Popunjeno/)
      await expect(groupOption).toHaveText(/slobodn/)
    })

    test('parent 3 can now select and submit with the freed spot', async ({ page }) => {
      await submitWithGroup(page, PARENT_3, '1', STD_GROUP_NAME)
    })

    test('group is full again after parent 3 re-fills the freed spot', async ({ page }) => {
      await reachStep3(page, PARENT_4)
      await page.locator('#grade').selectOption('1')
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })

      const groupOption = page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME })
      await expect(groupOption).toHaveText(/Popunjeno/)
    })
  })

  // ── F: Deleting (GDPR) an inquiry frees a spot ─────────────────────────────

  test.describe('F — Admin: GDPR Delete Frees a Spot', () => {
    test('admin GDPR-deletes parent 2 inquiry', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, PARENT_2.parentEmail)
      await page.locator('button', { hasText: 'Obriši (GDPR)' }).click()
      await expect(page.locator('text=Trajno obrisati upit?')).toBeVisible()
      await page.locator('[role="dialog"] button', { hasText: 'Trajno obriši' }).click()
      await page.waitForURL(`${BASE}/admin/upiti`, { timeout: 10000 })
    })

    test('parent 2 inquiry no longer appears in admin list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(PARENT_2.parentEmail)}`)
      await expect(page.locator('text=Nema upita koji odgovaraju filteru')).toBeVisible()
    })

    test('after GDPR delete, group shows 1 available spot', async ({ page }) => {
      await reachStep3(page, PARENT_4)
      await page.locator('#grade').selectOption('1')
      await expect(page.locator('#scheduledGroupId')).toBeEnabled({ timeout: 5000 })

      const groupOption = page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME })
      await expect(groupOption).not.toHaveText(/Popunjeno/)
      await expect(groupOption).toHaveText(/slobodn/)
    })

    test('parent 4 can now enrol in the group', async ({ page }) => {
      await submitWithGroup(page, PARENT_4, '1', STD_GROUP_NAME)
    })
  })

  // ── G: Radionica enrollment via /radionice/[slug] ───────────────────────────

  test.describe('G — Public: Radionica Form via Generated URL', () => {
    test('radionica page shows the workshop header', async ({ page }) => {
      await page.goto(`${BASE}/radionice/${RADIONICA_SLUG}`)
      await expect(page.locator('h1')).toContainText(RADIONICA_TITLE)
      // "Radionica" tag should be visible
      await expect(page.locator('text=Radionica').first()).toBeVisible()
    })

    test('radionica form does NOT show the grade dropdown', async ({ page }) => {
      await reachStep3(page, RAD_PARENT_1, `${BASE}/radionice/${RADIONICA_SLUG}`)
      // Grade select is hidden for workshop forms (preselectedCourseId is set)
      await expect(page.locator('#grade')).not.toBeVisible()
    })

    test('radionica group select is enabled immediately (no grade needed)', async ({ page }) => {
      await reachStep3(page, RAD_PARENT_1, `${BASE}/radionice/${RADIONICA_SLUG}`)
      await expect(page.locator('#scheduledGroupId')).toBeVisible()
      await expect(page.locator('#scheduledGroupId')).toBeEnabled()
    })

    test('radionica group appears as available in the dropdown', async ({ page }) => {
      await reachStep3(page, RAD_PARENT_1, `${BASE}/radionice/${RADIONICA_SLUG}`)
      const groupOption = page.locator('#scheduledGroupId option', {
        hasText: RADIONICA_GROUP_NAME,
      })
      await expect(groupOption).toHaveCount(1)
      await expect(groupOption).toHaveText(/slobodn/)
    })

    test('radionica form does NOT show the test standard group', async ({ page }) => {
      await reachStep3(page, RAD_PARENT_1, `${BASE}/radionice/${RADIONICA_SLUG}`)
      // Standard groups should not appear on the radionica-specific page
      await expect(
        page.locator('#scheduledGroupId option', { hasText: STD_GROUP_NAME }),
      ).toHaveCount(0)
    })

    test('parent 1 submits radionica inquiry with group (1 of 2 spots)', async ({ page }) => {
      await submitWithGroup(
        page,
        RAD_PARENT_1,
        null, // no grade for radionica
        RADIONICA_GROUP_NAME,
        `${BASE}/radionice/${RADIONICA_SLUG}`,
      )
    })

    test('parent 2 fills the last radionica spot (2 of 2)', async ({ page }) => {
      await submitWithGroup(
        page,
        RAD_PARENT_2,
        null,
        RADIONICA_GROUP_NAME,
        `${BASE}/radionice/${RADIONICA_SLUG}`,
      )
    })
  })

  // ── H: Radionica group fills up and shows as closed ─────────────────────────

  test.describe('H — Public: Radionica Group Full State', () => {
    test('radionica group shows "(Popunjeno)" after 2 inquiries', async ({ page }) => {
      const RAD_PARENT_3 = {
        parentName: `Luka Lukić ${RUN_ID}`,
        parentEmail: `luka.${RUN_ID}@test.hr`,
        parentPhone: '0977777777',
        childFirstName: 'Ana',
        childLastName: 'Lukić',
      }

      await reachStep3(page, RAD_PARENT_3, `${BASE}/radionice/${RADIONICA_SLUG}`)

      const groupOption = page.locator('#scheduledGroupId option', {
        hasText: RADIONICA_GROUP_NAME,
      })
      await expect(groupOption).toHaveCount(1)
      await expect(groupOption).toHaveText(/Popunjeno/)
    })

    test('full radionica group option is disabled', async ({ page }) => {
      const RAD_PARENT_3 = {
        parentName: `Luka Lukić ${RUN_ID}`,
        parentEmail: `luka.${RUN_ID}@test.hr`,
        parentPhone: '0977777777',
        childFirstName: 'Ana',
        childLastName: 'Lukić',
      }

      await reachStep3(page, RAD_PARENT_3, `${BASE}/radionice/${RADIONICA_SLUG}`)

      const groupOption = page.locator('#scheduledGroupId option', {
        hasText: RADIONICA_GROUP_NAME,
      })
      await expect(groupOption).toHaveAttribute('disabled', '')
    })

    test('radionica inquiry can still be submitted without selecting the full group', async ({
      page,
    }) => {
      const RAD_PARENT_3 = {
        parentName: `Luka Lukić ${RUN_ID}`,
        parentEmail: `luka.${RUN_ID}@test.hr`,
        parentPhone: '0977777777',
        childFirstName: 'Ana',
        childLastName: 'Lukić',
      }

      await reachStep3(page, RAD_PARENT_3, `${BASE}/radionice/${RADIONICA_SLUG}`)
      // Do not select the full group — just consent and submit
      await page.locator('input[name="consent"]').check()
      await page.locator('button', { hasText: 'Pošalji upit' }).click()
      await expect(page.locator('text=Upit je poslan!')).toBeVisible({ timeout: 15000 })
    })

    test('admin radionica inquiry list shows both confirmed radionica parents', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await page.goto(
        `${BASE}/admin/upiti?search=${encodeURIComponent(RAD_PARENT_1.parentName)}`,
      )
      await expect(page.locator(`text=${RAD_PARENT_1.parentName}`).first()).toBeVisible()

      await page.goto(
        `${BASE}/admin/upiti?search=${encodeURIComponent(RAD_PARENT_2.parentName)}`,
      )
      await expect(page.locator(`text=${RAD_PARENT_2.parentName}`).first()).toBeVisible()
    })

    test('admin radionica group row shows 2 in the Upiti column', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      // Find the radionica group row and verify its inquiry count
      // Radionice tab renders with hideProgram=false; Upiti is column index 4
      // (Naziv, Program, Lokacija, Termin, Upiti, Polaznici…)
      // There are two "Radionice" buttons (WeeklySchedule + GroupTabs); click the tab (last)
      await page.locator('button', { hasText: 'Radionice' }).last().click()
      const row = page.locator('tr', { hasText: RADIONICA_GROUP_NAME })
      await expect(row.locator('td').nth(4)).toHaveText('2')
    })
  })

  // ── I: Admin can edit a group ────────────────────────────────────────────────

  test.describe('I — Admin: Edit Group', () => {
    test('edit dialog opens with pre-filled fields', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      const row = page.locator('tr', { hasText: STD_GROUP_NAME })
      await row.locator('button', { hasText: 'Uredi' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      // Name field should be pre-filled
      const nameInput = dialog.locator('input[placeholder*="Grupa"]')
      await expect(nameInput).toHaveValue(STD_GROUP_NAME)
    })

    test('closing edit dialog without saving leaves group unchanged', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      const row = page.locator('tr', { hasText: STD_GROUP_NAME })
      await row.locator('button', { hasText: 'Uredi' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
      await expect(page.locator(`text=${STD_GROUP_NAME}`).first()).toBeVisible()
    })
  })

  // ── J: Admin can delete a group ─────────────────────────────────────────────
  //
  // The radionica and standard groups from earlier tests have reserved inquiries,
  // so their delete buttons are hidden (isGroupDeletable → false). Create a fresh
  // empty radionica group dedicated to the delete-dialog tests.

  const EMPTY_GROUP_NAME = `Test Prazna ${RUN_ID}`

  test.describe('J — Admin: Delete Group', () => {
    test.beforeAll(async ({ browser }) => {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await page.locator('button', { hasText: 'Nova grupa' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      const courseSelect = dialog.locator('select').nth(0)
      const radOpt = courseSelect.locator('option', { hasText: RADIONICA_TITLE }).first()
      const radVal = await radOpt.getAttribute('value')
      await courseSelect.selectOption(radVal!)

      const locationSelect = dialog.locator('select').nth(1)
      await locationSelect.selectOption({ index: 1 })

      await dialog.locator('input[placeholder*="Grupa"]').fill(EMPTY_GROUP_NAME)
      await dialog.locator('input[type="date"]').first().fill('2026-08-20')
      await dialog.locator('input[placeholder="19:00"]').fill('10:00')
      await dialog.locator('input[placeholder="20:30"]').fill('12:00')
      await dialog.locator('input[type="number"][min="1"]').fill('2')
      await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
      await expect(dialog).not.toBeVisible({ timeout: 10000 })

      await ctx.close()
    })

    test('delete dialog opens with group name and warning', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await page.locator('button', { hasText: 'Radionice' }).last().click()
      const row = page.locator('tr', { hasText: EMPTY_GROUP_NAME })
      await row.locator('button', { hasText: 'Obriši' }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=Obriši grupu')).toBeVisible()
      await expect(dialog.locator(`text=${EMPTY_GROUP_NAME}`).first()).toBeVisible()
    })

    test('cancel closes dialog without deleting the group', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe`)
      await page.locator('button', { hasText: 'Radionice' }).last().click()
      const row = page.locator('tr', { hasText: EMPTY_GROUP_NAME })
      await row.locator('button', { hasText: 'Obriši' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
      await expect(page.locator(`text=${EMPTY_GROUP_NAME}`).first()).toBeVisible()
    })
  })

  // ── K: Admin can delete a radionica ─────────────────────────────────────────
  //
  // The radionica is now rendered as a CourseCard div (not tbody tr).
  // Selector scopes match the A-group card-based pattern.

  test.describe('K — Admin: Delete Radionica', () => {
    test('delete dialog for radionica shows course title and cascade warning', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      const card = page.locator('div.rounded-lg').filter({
        has: page.locator('h3', { hasText: RADIONICA_TITLE }),
      })
      await card.getByRole('button', { name: /Obriši/ }).click()

      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('text=Obriši radionicu')).toBeVisible()
      await expect(dialog.locator(`text=${RADIONICA_TITLE}`).first()).toBeVisible()
      // The dialog should warn that groups will also be deleted
      await expect(dialog.locator('text=grupe')).toBeVisible()
    })

    test('cancel closes delete dialog without removing the radionica', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      const card = page.locator('div.rounded-lg').filter({
        has: page.locator('h3', { hasText: RADIONICA_TITLE }),
      })
      await card.getByRole('button', { name: /Obriši/ }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
      await expect(page.locator(`h3`, { hasText: RADIONICA_TITLE })).toBeVisible()
    })
  })
})
