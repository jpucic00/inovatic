import { test, expect, type Page } from '@playwright/test'
import { clickUntilVisible, submitUntilUrl } from '../helpers/hydration'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 8 — Student Management
// Tests run serially: beforeAll creates one inquiry for create-from-inquiry
// tests, then the suite exercises the student list, detail, create
// (manual + from-inquiry), add/remove enrollment, delete (GDPR), and edge
// cases (DOB-based dedup, username collision, diacritics, DECLINED blocking).
// Requires: dev server on localhost:3000, seeded admin user, seeded standard
// courses + groups (SLR 1..4 with at least one scheduled group each).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
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
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
  await page.waitForLoadState('networkidle')
}

async function submitInquiry(page: Page, data: typeof INQUIRY_FOR_ACCOUNT) {
  await page.goto(`${BASE}/upisi`)

  // Step 1 — parent info
  await page.locator('#parentName').fill(data.parentName)
  await page.locator('#parentEmail').fill(data.parentEmail)
  await page.locator('#parentPhone').fill(data.parentPhone)
  await clickUntilVisible(
    page.locator('button', { hasText: 'Dalje' }),
    page.locator('#childFirstName'),
  )

  // Step 2 — child info
  await page.locator('#childFirstName').fill(data.childFirstName)
  await page.locator('#childLastName').fill(data.childLastName)
  await page.locator('#dob-day').selectOption(data.dobDay)
  await page.locator('#dob-month').selectOption(data.dobMonth)
  await page.locator('#dob-year').selectOption(data.dobYear)
  await clickUntilVisible(
    page.locator('button', { hasText: 'Dalje' }),
    page.locator('input[name="consent"]'),
  )

  // Step 3 — grade, consent + submit
  await page.locator('select[name="grade"]').selectOption('3')
  await page.locator('input[name="consent"]').check()
  await clickUntilVisible(
    page.locator('button', { hasText: 'Pošalji upit' }),
    page.locator('text=Upit je poslan!'),
    { timeout: 30000 },
  )
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
  if (data.dateOfBirth) {
    // DateInput parses dd.MM.yyyy in Croatian locale (task 49j2wma).
    const [yyyy, mm, dd] = data.dateOfBirth.split('-')
    const dob = page.locator('#create-student-dob')
    await dob.fill(`${dd}.${mm}.${yyyy}`)
    await dob.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
  }
  if (data.childSchool) await page.locator('#create-student-school').fill(data.childSchool)
  if (data.parentName) await page.locator('#create-student-parent-name').fill(data.parentName)
  if (data.parentEmail) await page.locator('#create-student-parent-email').fill(data.parentEmail)
  if (data.parentPhone) await page.locator('#create-student-parent-phone').fill(data.parentPhone)

  // The dialog has a footer submit button with identical label to the trigger.
  // Scope it to the dialog to avoid strict-mode violations.
  const dialog = page.locator('[role="dialog"]')
  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
}

/**
 * Searches the student list for `lastName`, opens every matching student's
 * detail page, and returns the username shown in the "Pristupni podaci" card.
 * The create dialog no longer surfaces the generated username, so the
 * username-generation assertions read it off the detail page instead.
 */
async function readGeneratedUsernames(
  page: Page,
  lastName: string,
  nameRegex: RegExp,
): Promise<string[]> {
  await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(lastName)}`)
  const links = page.getByRole('link', { name: nameRegex })
  await expect(links.first()).toBeVisible({ timeout: 10000 })
  const hrefs = await links.evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? ''),
  )
  const usernames: string[] = []
  for (const href of hrefs) {
    await page.goto(`${BASE}${href}`)
    const username = (
      await page
        .locator('xpath=//dt[normalize-space()="Korisničko ime"]/following-sibling::dd')
        .first()
        .innerText()
    ).trim()
    usernames.push(username)
  }
  return usernames
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
        dateOfBirth: '2015-09-09',
      })
      // Result modal dropped — the dialog closes itself on success.
      await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 })
      await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(searchName)}`)
      await expect(page.getByRole('link', { name: new RegExp(searchName) })).toBeVisible()
    })
  })

  // ── Create student manually ────────────────────────────────────────────────

  test.describe('Create student manually', () => {
    test('dialog creates student, fires success toast, and closes', async ({ page }) => {
      await loginAsAdmin(page)
      await createStudentManuallyViaDialog(page, MANUAL_STUDENT)

      // The result modal was dropped — success is signalled by a toast that
      // points the admin to the profile for credentials, and the dialog closes.
      await expect(
        page.getByText('Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.'),
      ).toBeVisible({ timeout: 10000 })
      await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 })
    })

    test('submit button is disabled until firstName, lastName and date of birth are filled', async ({ page }) => {
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
      // Date of birth is now required, so names alone keep submit disabled.
      await expect(submit).toBeDisabled()
      const dob = page.locator('#create-student-dob')
      await dob.fill('10.04.2017')
      await dob.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
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
        dateOfBirth: '2015-10-10',
      }
      await createStudentManuallyViaDialog(page, disposable)
      // Result modal dropped — dialog closes on success; reach the profile via
      // the student list instead of an in-dialog link.
      await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 })
      await page.goto(
        `${BASE}/admin/ucenici?search=${encodeURIComponent(disposable.lastName)}`,
      )
      await page
        .getByRole('link', { name: new RegExp(`${disposable.firstName} ${disposable.lastName}`) })
        .first()
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
    // E1a + E1b dedup bundle (Flux cvyxnhq) — both branches of the
    // (firstName, lastName, dateOfBirth) dedup gate exercised in one flow.
    test('E1 — dedup gate: different DOB → 2 distinct, same DOB → existing returned', async ({ page }) => {
      await loginAsAdmin(page)
      const dialog = page.locator('[role="dialog"]')

      await test.step('E1a — same name + different DOB creates two distinct students', async () => {
        const sharedName = {
          firstName: `Marko${RUN_ID}`,
          lastName: `Dvojnik${RUN_ID}`,
        }

        await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: '2015-01-01' })
        await expect(
          page.getByText('Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.'),
          'first creation → NEW account toast',
        ).toBeVisible({ timeout: 10000 })
        await expect(dialog, 'dialog closes on success').toBeHidden({ timeout: 10000 })

        await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: '2010-12-31' })
        await expect(
          page.getByText('Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.'),
          'second creation (different DOB) → also a NEW account toast',
        ).toBeVisible({ timeout: 10000 })
        await expect(dialog, 'dialog closes on success').toBeHidden({ timeout: 10000 })

        await page.goto(
          `${BASE}/admin/ucenici?search=${encodeURIComponent(sharedName.firstName)}`,
        )
        const matches = page.getByRole('link', {
          name: new RegExp(`${sharedName.firstName} ${sharedName.lastName}`),
        })
        await expect(matches, 'list shows 2 distinct students with that name').toHaveCount(2)
      })

      await test.step('E1b — same name + same DOB returns existing (isExisting=true)', async () => {
        const sharedName = {
          firstName: `Neven${RUN_ID}`,
          lastName: `Postojeci${RUN_ID}`,
        }

        await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: DEDUP_DOB })
        await expect(
          page.getByText('Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.'),
          'first creation → NEW account toast',
        ).toBeVisible({ timeout: 10000 })
        await expect(dialog, 'dialog closes on success').toBeHidden({ timeout: 10000 })

        await createStudentManuallyViaDialog(page, { ...sharedName, dateOfBirth: DEDUP_DOB })
        await expect(
          page.getByText('Postojeći učenik pronađen i ažuriran.'),
          'second creation surfaces the "existing account" toast',
        ).toBeVisible({ timeout: 10000 })

        await page.goto(
          `${BASE}/admin/ucenici?search=${encodeURIComponent(sharedName.firstName)}`,
        )
        const matches = page.getByRole('link', {
          name: new RegExp(`${sharedName.firstName} ${sharedName.lastName}`),
        })
        await expect(matches, 'dedupe worked — list shows exactly 1 student').toHaveCount(1)
      })
    })

    // E2 + E3 username sanitization bundle (Flux cvyxnhq) — collision suffix
    // and diacritic strip both exercise the username-generation pipeline.
    test('E2 + E3 — username generation: collision adds suffix; Croatian diacritics stripped', async ({ page }) => {
      await loginAsAdmin(page)
      const dialog = page.locator('[role="dialog"]')

      await test.step('E2 — same normalized name → second account gets a "2" suffix', async () => {
        const baseFirst = `Iva${RUN_ID}`
        const baseLast = `Kolizija${RUN_ID}`

        await createStudentManuallyViaDialog(page, {
          firstName: baseFirst,
          lastName: baseLast,
          dateOfBirth: '2014-03-03',
        })
        await expect(dialog, 'first creation closes the dialog').toBeHidden({ timeout: 10000 })

        await createStudentManuallyViaDialog(page, {
          firstName: baseFirst,
          lastName: baseLast,
          dateOfBirth: '2014-04-04',
        })
        await expect(dialog, 'second creation (different DOB) closes the dialog').toBeHidden({
          timeout: 10000,
        })

        // Usernames are read off the detail pages now that the result modal is gone.
        const usernames = await readGeneratedUsernames(
          page,
          baseLast,
          new RegExp(`${baseFirst} ${baseLast}`),
        )
        expect(usernames, 'two colliding-name students were created').toHaveLength(2)
        expect(usernames[0], 'colliding usernames are disambiguated').not.toBe(usernames[1])
        expect(
          usernames.some((u) => /2\s*$/.test(u)),
          'one of the two usernames ends with the numeric suffix "2"',
        ).toBe(true)
      })

      await test.step('E3 — diacritics: Šime Čović → ASCII letters (no š/č)', async () => {
        const firstName = `Šime${RUN_ID}`
        const lastName = `Čović${RUN_ID}`
        await createStudentManuallyViaDialog(page, {
          firstName,
          lastName,
          dateOfBirth: '2013-07-07',
        })
        await expect(dialog, 'diacritic-name creation closes the dialog').toBeHidden({
          timeout: 10000,
        })

        const [username] = await readGeneratedUsernames(
          page,
          lastName,
          new RegExp(`${firstName} ${lastName}`),
        )
        expect(username, 'no Croatian š/č in the generated username').not.toMatch(/[šč]/i)
        expect(
          username.toLowerCase(),
          'username contains the latin-ized base "sime"',
        ).toContain('sime')
        expect(
          username.toLowerCase(),
          'username contains the latin-ized base "covic"',
        ).toContain('covic')
      })
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
      // The confirm button is gated on a decline reason (min 3 chars).
      await declineDialog.locator('#decline-reason').fill('Nema slobodnih mjesta u grupi.')
      // Confirm button label in the decline dialog
      await declineDialog.getByRole('button', { name: /Odbij/ }).click()
      await expect(declineDialog).toBeHidden({ timeout: 10000 })

      // After decline, the create-account button must not exist
      await expect(
        page.getByRole('button', { name: 'Kreiraj račun i upiši' }),
      ).toHaveCount(0)
    })
  })
})
