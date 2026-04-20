import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 8 — Module Enrollment + School-Year Historization
// Exercises the SchoolYearSelector, ModuleDatesTable, and the per-group
// ModuleEnrollmentPanel. Includes edge cases for the per-module "available
// spots" calculation (capacity − enrollments in the currently-Aktivan module),
// date shifts between Nadolazi/Aktivan/Završen states, and cross-year
// historization.
//
// Setup (beforeAll, serial):
//  - Admin login
//  - Use the seeded SLR 1 course ("Svijet LEGO Robotike 1") with its modules
//  - Create a dedicated scheduled group with known max capacity (MAX_CAPACITY)
//  - Create N test students and enroll them
//
// The tests for module-date manipulation shift the SLR 1 module schedule
// dates via the /admin/programi inline edit UI. They restore original dates
// in afterAll to avoid leaving the database in a weird state for other runs.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-6)

// SLR 1 — seeded standard course (title contains "Robotike 1")
const COURSE_SEARCH = 'Robotike 1'

const MAX_CAPACITY = 10
const STD_GROUP_NAME = `Test M-Grupa ${RUN_ID}`

// Deterministic dates for the 3-state scenario (relative to today 2026-04-15):
//  - Module 1 (Završen): 2025-09-01 → 2026-02-01
//  - Module 2 (Aktivan): 2026-03-01 → 2026-05-31
//  - Module 3 (Nadolazi): 2026-06-01 → 2026-09-30
//  - Module 4 (Nadolazi): 2026-10-01 → 2027-01-31
const SHIFT_DATES = [
  { startDate: '2025-09-01', endDate: '2026-02-01' },
  { startDate: '2026-03-01', endDate: '2026-05-31' },
  { startDate: '2026-06-01', endDate: '2026-09-30' },
  { startDate: '2026-10-01', endDate: '2027-01-31' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

/**
 * Locates the ModuleDatesTable wrapping SLR 1 and returns its scoped locator.
 * Scoped to the outer div.rounded-lg that contains both the header (h3) and
 * the modules table.
 */
function slrTable(page: Page) {
  return page.locator('div.rounded-lg').filter({
    has: page.locator('h3', { hasText: COURSE_SEARCH }),
  })
}

/**
 * Creates a scheduled group for SLR 1 via the admin UI. Returns the group
 * detail URL (we navigate to it after creation).
 */
async function createStandardGroup(page: Page, groupName: string): Promise<string> {
  await page.goto(`${BASE}/admin/grupe`)
  await page.locator('button', { hasText: 'Nova grupa' }).click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  const courseSelect = dialog.locator('select').nth(0)
  const slrOpt = courseSelect.locator('option', { hasText: COURSE_SEARCH }).first()
  const slrVal = await slrOpt.getAttribute('value')
  await courseSelect.selectOption(slrVal!)

  const locationSelect = dialog.locator('select').nth(1)
  await locationSelect.selectOption({ index: 1 })

  await dialog.locator('input[placeholder*="Grupa"]').fill(groupName)

  const daySelect = dialog.locator('select').nth(2)
  await daySelect.selectOption('Ponedjeljak')

  await dialog.locator('input[placeholder="19:00"]').fill('17:00')
  await dialog.locator('input[placeholder="20:30"]').fill('18:30')

  const maxInput = dialog.locator('input[type="number"][min="1"]')
  await maxInput.fill(String(MAX_CAPACITY))

  await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  // The new group is rendered as a <Link> inside the group table. Use the
  // role-based locator so we don't accidentally match a toast or some other
  // text node. The link's accessible name is exactly the group name.
  const groupLink = page.getByRole('link', { name: groupName, exact: true })
  await expect(groupLink).toBeVisible({ timeout: 10000 })
  await groupLink.click()
  await page.waitForURL(/\/admin\/grupe\/[^/]+$/, { timeout: 10000 })
  return page.url()
}

/**
 * Creates a student via the admin dialog and enrolls them into the given
 * group with all modules selected. Returns when the dialog has closed.
 */
async function createStudentAndEnroll(
  page: Page,
  firstName: string,
  lastName: string,
) {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  await page.locator('#create-student-first').fill(firstName)
  await page.locator('#create-student-last').fill(lastName)

  // Program → pick SLR 1 by matching option text
  const courseSelect = page.locator('#create-student-course')
  const opt = courseSelect.locator('option', { hasText: COURSE_SEARCH }).first()
  const val = await opt.getAttribute('value')
  await courseSelect.selectOption(val!)

  // Pick our group by name (it's one of the loaded radios)
  const groupLabel = dialog.locator('label', { hasText: STD_GROUP_NAME })
  await expect(groupLabel).toBeVisible({ timeout: 10000 })
  await groupLabel.locator('input[type="radio"]').check()

  // Check "Svi moduli" master checkbox (selects all 4 modules)
  const allModulesCheckbox = dialog
    .locator('label', { hasText: 'Svi moduli' })
    .locator('input[type="checkbox"]')
  await allModulesCheckbox.check()

  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Escape')
}

/**
 * Edits the date fields for a given module row (identified by index 0-based)
 * in the SLR 1 ModuleDatesTable. Saves and waits for the success toast.
 */
async function shiftModuleDates(
  page: Page,
  modIndex: number,
  startDate: string,
  endDate: string,
) {
  await page.goto(`${BASE}/admin/programi`)
  const table = slrTable(page)
  await expect(table).toBeVisible()

  const row = table.locator('tbody tr').nth(modIndex)
  // Click the pencil edit button
  await row.getByRole('button', { name: 'Uredi datume' }).click()
  // Two date inputs appear inline
  const dateInputs = row.locator('input[type="date"]')
  await dateInputs.nth(0).fill(startDate)
  await dateInputs.nth(1).fill(endDate)
  await row.getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText('Datumi modula ažurirani.')).toBeVisible({ timeout: 5000 })
}

/**
 * Captures the currently-displayed start/end dates for all module rows in
 * SLR 1's ModuleDatesTable, so we can restore them later. Parses the
 * rendered "dd.mm.yyyy." strings back to "yyyy-mm-dd".
 */
async function snapshotModuleDates(page: Page): Promise<{ startDate: string; endDate: string }[]> {
  await page.goto(`${BASE}/admin/programi`)
  const table = slrTable(page)
  await expect(table).toBeVisible()

  const rows = table.locator('tbody tr')
  const count = await rows.count()
  const result: { startDate: string; endDate: string }[] = []
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const startCell = await row.locator('td').nth(1).innerText()
    const endCell = await row.locator('td').nth(2).innerText()
    result.push({ startDate: parseHrDate(startCell), endDate: parseHrDate(endCell) })
  }
  return result
}

function parseHrDate(s: string): string {
  // "15.04.2026." → "2026-04-15"  |  "–" → ""
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (!m) return ''
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  const yyyy = m[3]
  return `${yyyy}-${mm}-${dd}`
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.serial('Phase 2 Step 8 — Module Enrollment + Historization', () => {
  let groupDetailUrl = ''
  let originalDates: { startDate: string; endDate: string }[] = []

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Snapshot original SLR 1 module dates (so we can restore them in afterAll)
    originalDates = await snapshotModuleDates(page)

    // Create a dedicated group + 9 students with all modules selected
    groupDetailUrl = await createStandardGroup(page, STD_GROUP_NAME)

    for (let i = 1; i <= 9; i++) {
      await createStudentAndEnroll(page, `Stud${i}${RUN_ID}`, `ModTest${RUN_ID}`)
    }
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    // Restore SLR 1 module dates so we don't leave the DB in a shifted state
    if (originalDates.length === 0) return
    test.setTimeout(120000)
    const page = await browser.newPage()
    try {
      await loginAsAdmin(page)
      for (let i = 0; i < originalDates.length; i++) {
        const d = originalDates[i]
        if (d.startDate && d.endDate) {
          await shiftModuleDates(page, i, d.startDate, d.endDate)
        }
      }
    } catch {
      // Restoration is best-effort; swallow errors
    } finally {
      await page.close()
    }
  })

  // ── Programi page — layout + school-year selector ──────────────────────────

  test.describe('Programi page', () => {
    test('loads with default school year and shows SchoolYearSelector', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      await expect(page.locator('h1', { hasText: 'Programi' })).toBeVisible()
      await expect(
        page.locator('h2', { hasText: 'Standardni programi' }),
      ).toBeVisible()
      // Year button for 2025/2026 is highlighted as selected (cyan bg)
      const currentYearBtn = page.getByRole('button', { name: /2025\/2026/ })
      await expect(currentYearBtn.first()).toBeVisible()
    })

    test('ModuleDatesTable renders SLR 1 with Modul/Početak/Završetak/Status/Polaznici columns', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      const table = slrTable(page)
      await expect(table.getByText('Modul', { exact: true })).toBeVisible()
      await expect(table.getByText('Početak', { exact: true })).toBeVisible()
      await expect(table.getByText('Završetak', { exact: true })).toBeVisible()
      await expect(table.getByText('Status', { exact: true })).toBeVisible()
      await expect(table.getByText('Polaznici', { exact: true })).toBeVisible()
    })

    test('Polaznici link navigates to students filtered by scheduleId', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      const table = slrTable(page)
      const firstPolazniciLink = table.locator('a[href*="scheduleId="]').first()
      await expect(firstPolazniciLink).toBeVisible()
      await firstPolazniciLink.click()
      await page.waitForURL(/\/admin\/ucenici\?scheduleId=[a-z0-9]+/)
      await expect(page.locator('h1', { hasText: 'Učenici' })).toBeVisible()
    })
  })

  // ── Group detail — ModuleEnrollmentPanel layout ────────────────────────────

  test.describe('ModuleEnrollmentPanel layout', () => {
    test('group detail shows module tabs and current capacity', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)
      await expect(page.locator('h1', { hasText: COURSE_SEARCH })).toBeVisible()
      // "Polaznici po modulima (9 u grupi)"
      await expect(page.getByText(/Polaznici po modulima \(9 u grupi\)/)).toBeVisible()
      // Four module tab buttons labeled M1..M4
      for (let i = 1; i <= 4; i++) {
        await expect(page.getByRole('button', { name: new RegExp(`^M${i}`) })).toBeVisible()
      }
    })

    test('capacity row shows 9/10 (1 slobodnih)', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)
      // Scope to the group-info <dl> to avoid matching the module-panel header
      // which also shows "(1 slobodnih)".
      const dl = page.locator('dl')
      await expect(dl.getByText(/9\/10 polaznika/)).toBeVisible()
      await expect(dl.getByText('(1 slobodnih)')).toBeVisible()
    })
  })

  // ── Available-spots calculation under module date shifts ───────────────────

  test.describe('Available spots under date shifts', () => {
    test('E8 — shifts make M1=Završen, M2=Aktivan, M3=M4=Nadolazi and spots reflect active module', async ({
      page,
    }) => {
      test.setTimeout(90000)
      await loginAsAdmin(page)

      // Shift all four modules into the target states
      for (let i = 0; i < SHIFT_DATES.length; i++) {
        await shiftModuleDates(page, i, SHIFT_DATES[i].startDate, SHIFT_DATES[i].endDate)
      }

      // Navigate to the group detail — per-module spots appear inside each tab.
      await page.goto(groupDetailUrl)

      // The default-expanded tab is the first Aktivan module (M2).
      // Header "{spotsUsed}/{maxStudents}" where spotsUsed is "students enrolled
      // in M2's schedule". All 9 students were enrolled with all modules, so
      // spotsUsed = 9 on every tab.
      await expect(page.getByText(/9\/10/).first()).toBeVisible()
      await expect(page.getByText(/1 slobodnih/).first()).toBeVisible()

      // Active tab should have the green dot indicator on the M2 button
      const m2Btn = page.getByRole('button', { name: /^M2/ })
      await expect(m2Btn).toBeVisible()
    })

    test('E9 — removing one student from the active module reduces its used count', async ({
      page,
    }) => {
      test.setTimeout(60000)
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)

      // Open M2 (already Aktivan from previous test)
      await page.getByRole('button', { name: /^M2/ }).click()

      // Locate the student row by its Link — ModuleEnrollmentPanel renders
      // each enrolled student as a Link inside a row div, followed by the
      // "Ukloni iz modula" XCircle button as a sibling. Get the row div by
      // scoping to the link.
      const studentName = `Stud1${RUN_ID} ModTest${RUN_ID}`
      const studentLink = page.getByRole('link', { name: studentName })
      await expect(studentLink).toBeVisible({ timeout: 10000 })
      const rowDiv = page.locator('div.py-2\\.5').filter({ has: studentLink })
      await rowDiv.getByRole('button', { name: 'Ukloni iz modula' }).click()
      await expect(page.getByText('Polaznik uklonjen iz modula.')).toBeVisible({
        timeout: 10000,
      })
      // Now 8/10 in M2
      await expect(page.getByText(/8\/10/).first()).toBeVisible()
      await expect(page.getByText(/2 slobodnih/).first()).toBeVisible()
    })

    test('E10 — "Završi modul" button visible only when a module is Aktivan', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)

      // M2 (Aktivan) shows "Završi modul"
      await page.getByRole('button', { name: /^M2/ }).click()
      await expect(page.getByRole('button', { name: 'Završi modul' })).toBeVisible()

      // M3 (Nadolazi) does not
      await page.getByRole('button', { name: /^M3/ }).click()
      await expect(page.getByRole('button', { name: 'Završi modul' })).toHaveCount(0)

      // M1 (Završen) does not either
      await page.getByRole('button', { name: /^M1/ }).click()
      await expect(page.getByRole('button', { name: 'Završi modul' })).toHaveCount(0)
    })

    test('E11 — "Sljedeći" button available on active tab promotes to next module', async ({
      page,
    }) => {
      test.setTimeout(60000)
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)
      // Open M2 (Aktivan)
      await page.getByRole('button', { name: /^M2/ }).click()

      // Since each student was enrolled in all 4 modules, "Sljedeći" should be
      // HIDDEN for any student who already has M3. We verify that the M2 tab
      // does not expose the button for a fully-enrolled student.
      await expect(page.getByRole('button', { name: 'Sljedeći' })).toHaveCount(0)
    })
  })

  // ── Historization (cross-year) ─────────────────────────────────────────────

  test.describe('Historization', () => {
    test('SchoolYearSelector switches the selected year via URL param', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)

      // Click "Nova godina" → confirm "Da" to create the next school year
      // (only if the next year button isn't already present)
      const nextYearLabel = '2026/2027'
      const nextYearBtn = page.getByRole('button', { name: new RegExp(nextYearLabel) })
      const alreadyExists = await nextYearBtn.first().isVisible().catch(() => false)
      if (!alreadyExists) {
        await page.getByRole('button', { name: /Nova godina/ }).click()
        // Use exact match — "Da" alone otherwise matches "Uredi datume" etc.
        await page.getByRole('button', { name: 'Da', exact: true }).click()
        await expect(
          page.getByText(`Školska godina ${nextYearLabel} kreirana.`),
        ).toBeVisible({ timeout: 10000 })
      }

      // Click the 2026/2027 button — URL should gain ?schoolYear=2026%2F2027
      await page.getByRole('button', { name: new RegExp(nextYearLabel) }).first().click()
      await page.waitForURL(/schoolYear=2026/)
      expect(page.url()).toContain('schoolYear=')
    })

    test('Switching back to 2025/2026 shows the original modules/enrollments', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi?schoolYear=2025%2F2026`)
      // SLR 1 table still present with our 4 modules
      const table = slrTable(page)
      await expect(table.locator('tbody tr')).toHaveCount(4)
    })
  })
})
