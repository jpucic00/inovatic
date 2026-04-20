import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 8 — Student Management
// Tests run serially: beforeAll creates one inquiry for create-from-inquiry
// tests, then the suite exercises the student list, detail, create
// (manual + from-inquiry), add/remove enrollment, delete (GDPR), and edge
// cases (DOB-based dedup, username collision, diacritics, DECLINED blocking,
// clipboard credentials copy).
// Requires: dev server on localhost:3000, seeded admin user, seeded standard
// courses + groups (SLR 1..4 with at least one scheduled group each).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

// Unique per test run so each run's data is identifiable even if old data exists
const RUN_ID = Date.now().toString().slice(-6)

// Data fixtures — names are suffixed with RUN_ID to avoid collisions
const MANUAL_STUDENT = {
  firstName: `Luka`,
  lastName: `Manualni${RUN_ID}`,
  dateOfBirth: '2016-05-12',
  childSchool: 'OŠ Split 3',
  parentName: `Toni Manualni ${RUN_ID}`,
  parentEmail: `toni.manualni.${RUN_ID}@test.com`,
  parentPhone: '0911234567',
}

const INQUIRY_FOR_ACCOUNT = {
  parentName: `Ivana Upitna ${RUN_ID}`,
  parentEmail: `ivana.upit.${RUN_ID}@test.com`,
  parentPhone: '0922223344',
  childFirstName: `Petar`,
  childLastName: `Upitić${RUN_ID}`,
  dobDay: '10',
  dobMonth: '04',
  dobYear: '2017',
}

const INQUIRY_FOR_DECLINE = {
  parentName: `Mirko Odbijeni ${RUN_ID}`,
  parentEmail: `mirko.odbijen.${RUN_ID}@test.com`,
  parentPhone: '0933332211',
  childFirstName: `Dora`,
  childLastName: `Odbijena${RUN_ID}`,
  dobDay: '5',
  dobMonth: '08',
  dobYear: '2018',
}

// Deterministic DOB so the "same name + same DOB" dedup path is testable
const DEDUP_DOB = '2015-09-03'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

async function submitInquiry(page: Page, data: typeof INQUIRY_FOR_ACCOUNT) {
  await page.goto(`${BASE}/upisi`)

  // Step 1 — parent info
  await page.locator('#parentName').fill(data.parentName)
  await page.locator('#parentEmail').fill(data.parentEmail)
  await page.locator('#parentPhone').fill(data.parentPhone)
  await page.locator('button', { hasText: 'Dalje' }).click()

  // Step 2 — child info
  await expect(page.locator('#childFirstName')).toBeVisible()
  await page.locator('#childFirstName').fill(data.childFirstName)
  await page.locator('#childLastName').fill(data.childLastName)
  await page.locator('#dob-day').selectOption(data.dobDay)
  await page.locator('#dob-month').selectOption(data.dobMonth)
  await page.locator('#dob-year').selectOption(data.dobYear)
  await page.locator('button', { hasText: 'Dalje' }).click()

  // Step 3 — grade, consent + submit
  await expect(page.locator('input[name="consent"]')).toBeVisible()
  await page.locator('select[name="grade"]').selectOption('3')
  await page.locator('input[name="consent"]').check()
  await page.locator('button', { hasText: 'Pošalji upit' }).click()

  await expect(page.locator('text=Upit je poslan!')).toBeVisible({ timeout: 15000 })
}

/** Opens the inquiry detail page by searching for the parent name. */
async function openInquiryDetail(page: Page, parentName: string) {
  await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(parentName)}`)
  await expect(page.locator('a', { hasText: 'Detalji' })).toHaveCount(1)
  await page.locator('a', { hasText: 'Detalji' }).click()
  await page.waitForURL(/\/admin\/upiti\/[a-z0-9]+/)
}

/**
 * Creates a student via the CreateStudentDialog on /admin/ucenici.
 * Only fills fields that are truthy. Returns nothing — caller asserts on
 * the result screen if needed.
 */
async function createStudentManuallyViaDialog(
  page: Page,
  data: {
    firstName: string
    lastName: string
    dateOfBirth?: string | null
    childSchool?: string
    parentName?: string
    parentEmail?: string
    parentPhone?: string
  },
) {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(
    page.locator('[role="dialog"]').getByRole('heading', { name: 'Kreiraj učenika' }),
  ).toBeVisible()

  await page.locator('#create-student-first').fill(data.firstName)
  await page.locator('#create-student-last').fill(data.lastName)
  if (data.dateOfBirth) await page.locator('#create-student-dob').fill(data.dateOfBirth)
  if (data.childSchool) await page.locator('#create-student-school').fill(data.childSchool)
  if (data.parentName) await page.locator('#create-student-parent-name').fill(data.parentName)
  if (data.parentEmail) await page.locator('#create-student-parent-email').fill(data.parentEmail)
  if (data.parentPhone) await page.locator('#create-student-parent-phone').fill(data.parentPhone)

  // The dialog has a footer submit button with identical label to the trigger.
  // Scope it to the dialog to avoid strict-mode violations.
  const dialog = page.locator('[role="dialog"]')
  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.serial('Phase 2 Step 8 — Student Management', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await submitInquiry(page, INQUIRY_FOR_ACCOUNT)
    await submitInquiry(page, INQUIRY_FOR_DECLINE)
    await page.close()
  })

  // ── Student list ───────────────────────────────────────────────────────────

  test.describe('Student list page', () => {
    test('list page loads with heading and total caption', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici`)
      await expect(page.locator('h1', { hasText: 'Učenici' })).toBeVisible()
      // Caption: "Ukupno N učenik" / "učenika"
      await expect(page.getByText(/Ukupno \d+ učenik/)).toBeVisible()
    })

    test('filter form renders search + program + group selects', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici`)
      await expect(
        page.getByPlaceholder('Pretraži po imenu ili korisničkom imenu...'),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Traži' })).toBeVisible()
      await expect(page.locator('select').filter({ hasText: 'Svi programi' })).toBeVisible()
      await expect(page.locator('select').filter({ hasText: 'Sve grupe' })).toBeVisible()
    })

    test('search filters by first name', async ({ page }) => {
      // Seed a student we can search for
      await loginAsAdmin(page)
      const searchName = `Traženi${RUN_ID}`
      await createStudentManuallyViaDialog(page, {
        firstName: searchName,
        lastName: `Pretraga${RUN_ID}`,
      })
      await expect(page.locator('[role="dialog"]').getByText('Učenik kreiran')).toBeVisible({
        timeout: 10000,
      })
      // Close dialog and search
      await page.keyboard.press('Escape')
      await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(searchName)}`)
      await expect(page.getByRole('link', { name: new RegExp(searchName) })).toBeVisible()
    })
  })

  // ── Create student manually ────────────────────────────────────────────────

  test.describe('Create student manually', () => {
    test('dialog creates student and shows credentials', async ({ page }) => {
      await loginAsAdmin(page)
      await createStudentManuallyViaDialog(page, MANUAL_STUDENT)

      // Result screen
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      await expect(dialog.getByText('Pristupni podaci')).toBeVisible()
      await expect(dialog.getByText('Korisničko ime:')).toBeVisible()
      await expect(dialog.getByText('Lozinka:')).toBeVisible()
      await expect(dialog.getByRole('link', { name: 'Profil učenika' })).toBeVisible()
    })

    test('submit button is disabled until firstName and lastName are filled', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici`)
      await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
      const dialog = page.locator('[role="dialog"]')
      const submit = dialog.getByRole('button', { name: 'Kreiraj učenika' })
      await expect(submit).toBeDisabled()
      await page.locator('#create-student-first').fill('A')
      await expect(submit).toBeDisabled()
      await page.locator('#create-student-first').fill('Ana')
      await page.locator('#create-student-last').fill('Test')
      await expect(submit).toBeEnabled()
    })
  })

  // ── Create student from inquiry ────────────────────────────────────────────

  test.describe('Create student from inquiry', () => {
    test('creates STUDENT account and flips inquiry to ACCOUNT_CREATED', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_FOR_ACCOUNT.parentName)

      // Open create-account dialog
      await page.getByRole('button', { name: 'Kreiraj račun i upiši' }).click()
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Select the first program from the dropdown (standard courses are pre-seeded)
      const courseSelect = dialog.locator('select').first()
      await courseSelect.selectOption({ index: 1 })

      // Wait for groups to load, then pick the first available group
      await expect(dialog.locator('input[type="radio"]').first()).toBeVisible({
        timeout: 10000,
      })
      await dialog.locator('input[type="radio"]').first().check()

      // Select all modules (the "Svi moduli" master checkbox)
      const allModulesCheckbox = dialog.locator('label', { hasText: 'Svi moduli' }).locator('input[type="checkbox"]')
      if (await allModulesCheckbox.isVisible().catch(() => false)) {
        await allModulesCheckbox.check()
      }

      // Submit
      await dialog.getByRole('button', { name: /Kreiraj račun/ }).click()

      // After successful creation the server action flips the inquiry status
      // and router.refresh() re-renders the page, which unmounts the dialog
      // (CreateAccountDialog trigger is conditional on canCreateAccount). We
      // verify the post-state by observing the page itself.
      await expect(page.getByRole('link', { name: /Pogledaj profil učenika/ })).toBeVisible({
        timeout: 15000,
      })

      // Back on the inquiry list, the inquiry should now be ACCOUNT_CREATED
      await page.goto(
        `${BASE}/admin/upiti?search=${encodeURIComponent(INQUIRY_FOR_ACCOUNT.parentName)}`,
      )
      await expect(page.getByText('Račun stvoren').first()).toBeVisible()
    })
  })

  // ── Student detail page ────────────────────────────────────────────────────

  test.describe('Student detail page', () => {
    test('renders credentials, data, enrollments, notes, and danger zone sections', async ({
      page,
    }) => {
      await loginAsAdmin(page)

      // Navigate to the manually-created student from the previous test
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(MANUAL_STUDENT.firstName)}`,
      )
      const studentLink = page.getByRole('link', {
        name: new RegExp(`${MANUAL_STUDENT.firstName} ${MANUAL_STUDENT.lastName}`),
      })
      await expect(studentLink).toBeVisible()
      await studentLink.click()
      await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

      // Header
      await expect(
        page.locator('h1', { hasText: `${MANUAL_STUDENT.firstName} ${MANUAL_STUDENT.lastName}` }),
      ).toBeVisible()
      // Sections — use exact matches since "Pristupni podaci" and "Podaci"
      // would otherwise collide under strict mode.
      await expect(page.getByRole('heading', { name: 'Pristupni podaci' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Podaci', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Upisane grupe' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Bilješke' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Opasna zona' })).toBeVisible()

      // Personal data fields
      await expect(page.getByText('Korisničko ime')).toBeVisible()
      await expect(page.getByText('Lozinka')).toBeVisible()
      await expect(page.getByText('Datum rođenja')).toBeVisible()
      await expect(page.getByText(MANUAL_STUDENT.childSchool)).toBeVisible()
      await expect(page.getByText(MANUAL_STUDENT.parentName)).toBeVisible()
    })

    test('add enrollment dialog adds the student to a group', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(MANUAL_STUDENT.firstName)}`,
      )
      await page
        .getByRole('link', {
          name: new RegExp(`${MANUAL_STUDENT.firstName} ${MANUAL_STUDENT.lastName}`),
        })
        .click()
      await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

      // Open the add-enrollment dialog
      await page.getByRole('button', { name: 'Upiši u novu grupu' }).click()
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Pick the first program + first group
      await dialog.locator('select').first().selectOption({ index: 1 })
      await expect(dialog.locator('input[type="radio"]').first()).toBeVisible({
        timeout: 10000,
      })
      await dialog.locator('input[type="radio"]').first().check()

      await dialog.getByRole('button', { name: /^Upiši$/ }).click()

      // After refresh, "Nema upisa." should be gone (at least one enrollment row present)
      await expect(page.locator('text=Nema upisa.')).toBeHidden()
    })
  })

  // ── Delete student (GDPR) ──────────────────────────────────────────────────

  test.describe('Delete student (GDPR)', () => {
    test('deleting a student removes them from the list', async ({ page }) => {
      await loginAsAdmin(page)

      // Create a disposable student just for this test
      const disposable = {
        firstName: `Trošen${RUN_ID}`,
        lastName: `Brišemo${RUN_ID}`,
      }
      await createStudentManuallyViaDialog(page, disposable)
      await expect(page.locator('[role="dialog"]').getByText('Učenik kreiran')).toBeVisible({
        timeout: 10000,
      })
      await page
        .locator('[role="dialog"]')
        .getByRole('link', { name: 'Profil učenika' })
        .click()
      await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

      // Open delete dialog, confirm
      await page.getByRole('button', { name: 'Obriši učenika (GDPR)' }).click()
      await page.getByRole('button', { name: 'Obriši trajno' }).click()

      // Should redirect to list; search should find 0 results
      await page.waitForURL(`${BASE}/admin/ucenici`, { timeout: 10000 })
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(disposable.firstName)}`,
      )
      await expect(
        page.getByRole('link', { name: new RegExp(`${disposable.firstName}`) }),
      ).toHaveCount(0)
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  test.describe('Edge cases', () => {
    // E1a — same firstName+lastName but DIFFERENT date of birth should create two distinct students
    test('E1a — same name + different DOB creates two distinct students', async ({ page }) => {
      await loginAsAdmin(page)

      const sharedName = {
        firstName: `Marko${RUN_ID}`,
        lastName: `Dvojnik${RUN_ID}`,
      }

      // First creation — succeeds
      await createStudentManuallyViaDialog(page, {
        ...sharedName,
        dateOfBirth: '2015-01-01',
      })
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      // Assert it's a NEW account (green credentials box is rendered)
      await expect(dialog.getByText('Pristupni podaci')).toBeVisible()
      await page.keyboard.press('Escape')

      // Second creation — same name, DIFFERENT DOB → should also be a NEW account
      await createStudentManuallyViaDialog(page, {
        ...sharedName,
        dateOfBirth: '2010-12-31',
      })
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      // New account → green Pristupni podaci box should still be visible
      await expect(dialog.getByText('Pristupni podaci')).toBeVisible()
      await page.keyboard.press('Escape')

      // List should show 2 students with this name (different usernames)
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(sharedName.firstName)}`,
      )
      const matches = page.getByRole('link', {
        name: new RegExp(`${sharedName.firstName} ${sharedName.lastName}`),
      })
      await expect(matches).toHaveCount(2)
    })

    // E1b — same firstName+lastName AND same DOB should return the existing student
    test('E1b — same name + same DOB returns existing student (isExisting flag)', async ({
      page,
    }) => {
      await loginAsAdmin(page)

      const sharedName = {
        firstName: `Neven${RUN_ID}`,
        lastName: `Postojeci${RUN_ID}`,
      }

      // First creation — new account with green credentials box
      await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: DEDUP_DOB })
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      await expect(dialog.getByText('Pristupni podaci')).toBeVisible()
      await page.keyboard.press('Escape')

      // Second creation — same name + same DOB → should return isExisting=true
      // DialogTitle is still "Učenik kreiran" in both paths; the differentiator
      // is the description text + absence of the green credentials box.
      await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: DEDUP_DOB })
      await expect(
        dialog.getByText('Pronađen je postojeći račun za ovo dijete.'),
      ).toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')

      // List should show exactly 1 student (dedupe worked)
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(sharedName.firstName)}`,
      )
      const matches = page.getByRole('link', {
        name: new RegExp(`${sharedName.firstName} ${sharedName.lastName}`),
      })
      await expect(matches).toHaveCount(1)
    })

    // E2 — username collision: two students whose names normalize to the
    // same base username should get suffixed (base, base2).
    test('E2 — username collision gets numeric suffix disambiguation', async ({ page }) => {
      await loginAsAdmin(page)

      // Two students with same normalized name but different DOB to avoid
      // the DOB dedup short-circuit.
      const baseFirst = `Iva${RUN_ID}`
      const baseLast = `Kolizija${RUN_ID}`

      await createStudentManuallyViaDialog(page, {
        firstName: baseFirst,
        lastName: baseLast,
        dateOfBirth: '2014-03-03',
      })
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      // Capture the first username from the result screen.
      const firstUsername = await dialog
        .locator('p', { hasText: 'Korisničko ime:' })
        .first()
        .innerText()
      await page.keyboard.press('Escape')

      await createStudentManuallyViaDialog(page, {
        firstName: baseFirst,
        lastName: baseLast,
        dateOfBirth: '2014-04-04',
      })
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })
      const secondUsername = await dialog
        .locator('p', { hasText: 'Korisničko ime:' })
        .first()
        .innerText()

      // Usernames should differ: second should end with "2" suffix
      expect(firstUsername).not.toBe(secondUsername)
      expect(secondUsername).toMatch(/2\s*$/)
    })

    // E3 — diacritics: Croatian chars should be stripped from the username
    test('E3 — Croatian diacritics are stripped from the username', async ({ page }) => {
      await loginAsAdmin(page)
      // Note: names include unique RUN_ID so this doesn't collide with E2
      const firstName = `Šime${RUN_ID}`
      const lastName = `Čović${RUN_ID}`

      await createStudentManuallyViaDialog(page, {
        firstName,
        lastName,
        dateOfBirth: '2013-07-07',
      })
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })

      // Strip the "Korisničko ime:" label so we only inspect the actual username.
      // Note: the label itself contains 'č', so we must not match against the
      // full line.
      const rawLine = await dialog
        .locator('p', { hasText: 'Korisničko ime:' })
        .first()
        .innerText()
      const username = rawLine.replace(/^[^:]*:\s*/, '').trim()
      expect(username).not.toMatch(/[šč]/i)
      // And it should contain the latin-ized base "sime" + "covic"
      expect(username.toLowerCase()).toContain('sime')
      expect(username.toLowerCase()).toContain('covic')
    })

    // E4 — DECLINED inquiry: the "Kreiraj račun i upiši" button must be hidden
    test('E4 — DECLINED inquiry hides the "Kreiraj račun i upiši" button', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_FOR_DECLINE.parentName)

      // Decline the inquiry
      await page.getByRole('button', { name: /Odbij/ }).click()
      const declineDialog = page.locator('[role="dialog"]')
      await expect(declineDialog).toBeVisible()
      // Confirm button label in the decline dialog
      await declineDialog.getByRole('button', { name: /Odbij/ }).click()
      await expect(declineDialog).toBeHidden({ timeout: 10000 })

      // After decline, the create-account button must not exist
      await expect(
        page.getByRole('button', { name: 'Kreiraj račun i upiši' }),
      ).toHaveCount(0)
    })

    // E5 — clipboard: the "Kopiraj podatke" button should fire a success toast
    test('E5 — copy credentials button shows a success toast', async ({ page, context }) => {
      // Grant clipboard permissions so navigator.clipboard.writeText resolves
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await loginAsAdmin(page)

      await createStudentManuallyViaDialog(page, {
        firstName: `Clip${RUN_ID}`,
        lastName: `Board${RUN_ID}`,
        dateOfBirth: '2012-02-02',
      })
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })

      await dialog.getByRole('button', { name: 'Kopiraj podatke' }).click()
      // Sonner toast with success message
      await expect(page.getByText('Podaci kopirani.')).toBeVisible({ timeout: 5000 })
    })
  })
})
