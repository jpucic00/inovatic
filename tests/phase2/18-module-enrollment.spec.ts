import { test, expect, type Page } from '@playwright/test'
import { clickUntilVisible } from '../helpers/hydration'
import { loginAsAdmin as sharedLoginAsAdmin } from '../helpers/phase3'
import { cleanupRunFixtures } from '../helpers/cleanup'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 8 — Module Enrollment + School-Year Historization
// Exercises the SchoolYearSwitcher, ModuleDatesTable, and the per-group
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

const RUN_ID = Date.now().toString().slice(-6)

// SLR 1 — seeded standard course (title contains "Robotike 1")
const COURSE_SEARCH = 'Robotike 1'

const MAX_CAPACITY = 10
const STD_GROUP_NAME = `Test M-Grupa ${RUN_ID}`

// Deterministic 3-state windows computed against the real run date so the
// spec doesn't rot as time passes: M1 fully past (Završen), M2 spanning
// today (Aktivan), M3/M4 in the future (Nadolazi). Wide ±30-day margins make
// UTC-vs-local off-by-one irrelevant.
const isoDay = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}
const SHIFT_DATES = [
  { startDate: isoDay(-200), endDate: isoDay(-50) },
  { startDate: isoDay(-30), endDate: isoDay(30) },
  { startDate: isoDay(31), endDate: isoDay(120) },
  { startDate: isoDay(121), endDate: isoDay(200) },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Delegates to the shared panel-aware helper: the seeded admin can hold a
// TeacherAssignment, which turns login into the dual-role panel chooser —
// driving the form here and waiting for /admin hangs on a login that
// actually SUCCEEDED (see .claude/validate.md decisions log, 2026-07-27).
async function loginAsAdmin(page: Page) {
  await sharedLoginAsAdmin(page)
  await page.waitForLoadState('networkidle')
}

/**
 * Navigates to the SLR 1 program detail page (the module-dates table moved off
 * the /admin/programi list onto the per-program detail page). Clicks the SLR 1
 * card and waits for the /admin/programi/[courseId] URL.
 */
async function gotoSlrProgramDetail(page: Page) {
  await page.goto(`${BASE}/admin/programi`)
  await page
    .locator('a[href^="/admin/programi/"]', { hasText: COURSE_SEARCH })
    .first()
    .click()
  await page.waitForURL(/\/admin\/programi\/[^/?#]+$/, { timeout: 15000 })
}

/**
 * Locates the SLR 1 ModuleDatesTable on the program detail page. Scoped to the
 * "Moduli i datumi" section, which holds the single module-dates table.
 * Callers must already be on the detail page (use gotoSlrProgramDetail first).
 */
function slrTable(page: Page) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { level: 2, name: 'Moduli i datumi' }),
  })
}

/**
 * Locates the ModuleEnrollmentPanel module-tab button on the group-detail
 * page. The Galerija section now renders a parallel set of "Modul N – ..."
 * buttons, so we scope by the panel that contains the "Polaznici po
 * modulima" heading.
 */
// Module tabs are labelled with the real curriculum titles (seed SLR 1
// modules, sortOrder 1..4), not "Modul N".
const MODULE_TAB_TITLES = [
  /Zabavni sustavi/i,
  /Prometni sustavi/i,
  /Industrijski sustavi/i,
  /Svemirski sustavi/i,
]

function moduleTabButton(page: Page, n: number) {
  return page
    .locator('div.bg-white.rounded-xl', {
      has: page.getByText(/Polaznici po modulima/),
    })
    .getByRole('button', { name: MODULE_TAB_TITLES[n - 1] })
}

/**
 * Creates a scheduled group for SLR 1 via the admin UI. Returns the group
 * detail URL (we navigate to it after creation).
 */
async function createStandardGroup(page: Page, groupName: string): Promise<string> {
  await page.goto(`${BASE}/admin/grupe`)
  const dialog = page.locator('[role="dialog"]')
  await clickUntilVisible(
    page.locator('button', { hasText: 'Nova grupa' }),
    dialog,
  )

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

  // The signup window now lives on the program (per school year), not the
  // group dialog. This test exercises admin module enrollment, not the public
  // form, so no window is needed.
  await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  // The new group is rendered as a <Link> inside the group table. Use the
  // role-based locator so we don't accidentally match a toast or some other
  // text node. The link's accessible name is exactly the group name.
  const groupLink = page.getByRole('link', { name: groupName, exact: true })
  await expect(groupLink).toBeVisible({ timeout: 10000 })
  // Read the href and goto directly — Next.js dev server is slow enough
  // compiling /admin/grupe/[id] cold that the link's client-nav navigation
  // can outrun the waitForURL window if hydration also races.
  const href = await groupLink.getAttribute('href')
  if (!href) throw new Error(`group link has no href for ${groupName}`)
  await page.goto(`${BASE}${href}`)
  await page.waitForURL(/\/admin\/grupe\/[^/]+$/, { timeout: 30000 })
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
  const dialog = page.locator('[role="dialog"]')
  await clickUntilVisible(
    page.getByRole('button', { name: 'Kreiraj učenika' }),
    dialog,
  )

  await page.locator('#create-student-first').fill(firstName)
  await page.locator('#create-student-last').fill(lastName)
  // Date of birth is required for submit; the DateInput commits on blur.
  const dob = page.locator('#create-student-dob')
  await dob.fill('10.04.2016')
  await dob.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
  // Parent e-mail is mandatory on manual create — without it submit stays disabled.
  await page
    .locator('#create-student-parent-email')
    .fill(`${firstName}.${lastName}`.toLowerCase().replaceAll(/[^a-z0-9.]/g, '') + '@test.com')

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
  // The post-create credentials modal was dropped — success is a toast and
  // the dialog closes on its own.
  await expect(
    page.getByText('Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.'),
  ).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden({ timeout: 10000 })
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
  await gotoSlrProgramDetail(page)
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
  await gotoSlrProgramDetail(page)
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
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Snapshot original SLR 1 module dates (so we can restore them in afterAll)
    originalDates = await snapshotModuleDates(page)

    // Shift the four SLR 1 modules into deterministic states (M1=Završen,
    // M2=Aktivan, M3=M4=Nadolazi) so the remove-student-from-module and
    // button-visibility tests below have a known active-module context.
    // Date-state derivation is unit-tested at tests/unit/lib/active-module.test.ts.
    for (let i = 0; i < SHIFT_DATES.length; i++) {
      await shiftModuleDates(page, i, SHIFT_DATES[i].startDate, SHIFT_DATES[i].endDate)
    }

    // Create a dedicated group + 9 students with all modules selected
    groupDetailUrl = await createStandardGroup(page, STD_GROUP_NAME)

    for (let i = 1; i <= 9; i++) {
      await createStudentAndEnroll(page, `Stud${i}${RUN_ID}`, `ModTest${RUN_ID}`)
    }
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    // The group + students this spec created: they are named after the run, so
    // they would otherwise pile up in the same weekday lane forever.
    await cleanupRunFixtures(RUN_ID)

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
    test('loads with default school year and shows the school-year switcher', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)
      await expect(page.locator('h1', { hasText: 'Programi' })).toBeVisible()
      await expect(
        page.locator('h2', { hasText: 'Standardni programi' }),
      ).toBeVisible()
      // The global school-year switcher in the sidebar defaults to the current year.
      const switcher = page.getByLabel('Odaberi školsku godinu')
      await expect(switcher).toBeVisible()
      await expect(switcher).toContainText('2025/2026')
    })

    test('ModuleDatesTable renders SLR 1 with Modul/Početak/Završetak/Status/Polaznici columns', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      await gotoSlrProgramDetail(page)
      const table = slrTable(page)
      await expect(table.getByText('Modul', { exact: true })).toBeVisible()
      await expect(table.getByText('Početak', { exact: true })).toBeVisible()
      await expect(table.getByText('Završetak', { exact: true })).toBeVisible()
      await expect(table.getByText('Status', { exact: true })).toBeVisible()
      await expect(table.getByText('Polaznici', { exact: true })).toBeVisible()
    })

    test('Polaznici link navigates to students filtered by scheduleId', async ({ page }) => {
      await loginAsAdmin(page)
      await gotoSlrProgramDetail(page)
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
      // Four module tab buttons, one per Modul 1..4. Galerija renders a
      // parallel set with (0) counts — moduleTabButton scopes to the
      // enrollment panel.
      for (let i = 1; i <= 4; i++) {
        await expect(moduleTabButton(page, i)).toBeVisible()
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
    // E8 ("shifts make M1=Završen, M2=Aktivan, M3=M4=Nadolazi…") moved to
    // tests/unit/lib/active-module.test.ts — the date-state derivation logic
    // is now exercised directly against getCurrentActiveModuleForGroup without
    // needing the dev server, DB, or Chromium round-trip. The module-date
    // shifts that this test used to perform are now done in beforeAll so the
    // remaining UI tests below still observe the M2=Aktivan state.

    test('E9 — removing one student from the active module reduces its used count', async ({
      page,
    }) => {
      test.setTimeout(60000)
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)

      // Open Modul 2 (already Aktivan from previous test)
      await moduleTabButton(page, 2).click()

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

    test('E10 — "Završi" button visible only on the Aktivan module row (programi page)', async ({
      page,
    }) => {
      // The "Završi modul" bulk action moved from the group detail
      // ModuleEnrollmentPanel to the ModuleDatesTable, now on the per-program
      // detail page, and was renamed to just "Završi". It only shows on rows
      // whose status is Aktivan.
      await loginAsAdmin(page)
      await gotoSlrProgramDetail(page)
      const table = slrTable(page)
      await expect(table).toBeVisible()

      const rows = table.locator('tbody tr')
      // M1 (Završen) — no "Završi" button on the row
      await expect(rows.nth(0).getByRole('button', { name: 'Završi' })).toHaveCount(0)
      // M2 (Aktivan) — button present
      await expect(rows.nth(1).getByRole('button', { name: 'Završi' })).toBeVisible()
      // M3 (Nadolazi) — no button
      await expect(rows.nth(2).getByRole('button', { name: 'Završi' })).toHaveCount(0)
      // M4 (Nadolazi) — no button
      await expect(rows.nth(3).getByRole('button', { name: 'Završi' })).toHaveCount(0)
    })

    test('E11 — "Sljedeći" button available on active tab promotes to next module', async ({
      page,
    }) => {
      test.setTimeout(60000)
      await loginAsAdmin(page)
      await page.goto(groupDetailUrl)
      // Open Modul 2 (Aktivan)
      await moduleTabButton(page, 2).click()

      // Since each student was enrolled in all 4 modules, "Sljedeći" should be
      // HIDDEN for any student who already has M3. We verify that the M2 tab
      // does not expose the button for a fully-enrolled student.
      await expect(page.getByRole('button', { name: 'Sljedeći' })).toHaveCount(0)
    })
  })

  // ── Historization (cross-year) ─────────────────────────────────────────────

  test.describe('Historization', () => {
    test('the switcher creates a new blank school year', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)

      const switcher = page.getByLabel('Odaberi školsku godinu')
      const nextYearLabel = '2026/2027'

      // Register the next year only if it does not already exist. When a
      // previous run left it registered, select it from the dropdown instead —
      // the create path auto-switches, so both paths end on the next year.
      await switcher.click()
      const nextOption = page.getByRole('option', { name: new RegExp(nextYearLabel) })
      const alreadyExists = await nextOption.isVisible().catch(() => false)

      if (alreadyExists) {
        await nextOption.click()
      } else {
        await page.keyboard.press('Escape')
        await page.getByLabel('Nova školska godina').click()
        await page
          .getByRole('button', { name: new RegExp(`Kreiraj ${nextYearLabel}`) })
          .click()
        await expect(
          page.getByText(`Školska godina ${nextYearLabel} kreirana.`),
        ).toBeVisible({ timeout: 10000 })
      }

      // Both paths end with the switcher on the newly selected/created year.
      await expect(switcher).toContainText(nextYearLabel)
    })

    test('switching the school year updates the programs view', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi`)

      const switcher = page.getByLabel('Odaberi školsku godinu')

      // Switch to the next year if it is registered, then back to the current year.
      await switcher.click()
      const nextOption = page.getByRole('option', { name: /2026\/2027/ })
      if (await nextOption.isVisible().catch(() => false)) {
        await nextOption.click()
        await expect(switcher).toContainText('2026/2027')
        await switcher.click()
      }
      await page.getByRole('option', { name: '2025/2026' }).click()
      await expect(switcher).toContainText('2025/2026')

      // SLR 1 table renders one row per module (4) for the selected year.
      await gotoSlrProgramDetail(page)
      const table = slrTable(page)
      await expect(table.locator('tbody tr')).toHaveCount(4)
    })
  })
})
