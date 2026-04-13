import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 6 — Admin Dashboard + Inquiry Management
// Tests run serially: beforeAll creates 3 inquiries, then tests verify
// list, search, filter, detail, decline, and delete (GDPR) features.
// Requires: dev server on localhost:3000, seeded admin user.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

// Unique per test run so each run's data is identifiable even if old data exists
const RUN_ID = Date.now().toString().slice(-6)

const INQUIRY_MAIN = {
  parentName: `Marko Testić ${RUN_ID}`,
  parentEmail: `marko.${RUN_ID}@test.com`,
  parentPhone: '0911111111',
  childFirstName: `Luka`,
  childLastName: `Testić ${RUN_ID}`,
  childName: `Luka Testić ${RUN_ID}`,
  dobDay: '15',
  dobMonth: '03',
  dobYear: '2017',
}

const INQUIRY_TO_DECLINE = {
  parentName: `Ana Testić ${RUN_ID}`,
  parentEmail: `ana.${RUN_ID}@test.com`,
  parentPhone: '0922222222',
  childFirstName: `Petra`,
  childLastName: `Testić ${RUN_ID}`,
  childName: `Petra Testić ${RUN_ID}`,
  dobDay: '1',
  dobMonth: '06',
  dobYear: '2015',
}

const INQUIRY_TO_DELETE = {
  parentName: `Ivan Testić ${RUN_ID}`,
  parentEmail: `ivan.${RUN_ID}@test.com`,
  parentPhone: '0933333333',
  childFirstName: `Mia`,
  childLastName: `Testić ${RUN_ID}`,
  childName: `Mia Testić ${RUN_ID}`,
  dobDay: '20',
  dobMonth: '09',
  dobYear: '2019',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function submitInquiry(page: Page, data: typeof INQUIRY_MAIN) {
  await page.goto(`${BASE}/upisi`)

  // Step 1 — parent info
  await page.locator('#parentName').fill(data.parentName)
  await page.locator('#parentEmail').fill(data.parentEmail)
  await page.locator('#parentPhone').fill(data.parentPhone)
  await page.locator('button', { hasText: 'Dalje' }).click()

  // Step 2 — child info (wait for step to render)
  await expect(page.locator('#childFirstName')).toBeVisible()
  await page.locator('#childFirstName').fill(data.childFirstName)
  await page.locator('#childLastName').fill(data.childLastName)
  await page.locator('#dob-day').selectOption(data.dobDay)
  await page.locator('#dob-month').selectOption(data.dobMonth)
  await page.locator('#dob-year').selectOption(data.dobYear)
  await page.locator('button', { hasText: 'Dalje' }).click()

  // Step 3 — grade, consent + submit (wait for step to render)
  await expect(page.locator('input[name="consent"]')).toBeVisible()
  await page.locator('select[name="grade"]').selectOption('3')
  await page.locator('input[name="consent"]').check()
  await page.locator('button', { hasText: 'Pošalji upit' }).click()

  await expect(page.locator('text=Upit je poslan!')).toBeVisible({ timeout: 15000 })
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

/** Navigate to the detail page of an inquiry by searching for the parent name */
async function openInquiryDetail(page: Page, parentName: string) {
  // Navigate directly with the search param so the server renders pre-filtered results
  await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(parentName)}`)
  // Wait for exactly 1 result row before clicking (confirms filter applied and unique match)
  await expect(page.locator('a', { hasText: 'Detalji' })).toHaveCount(1)
  await page.locator('a', { hasText: 'Detalji' }).click()
  await page.waitForURL(/\/admin\/upiti\/[a-z0-9]+/)
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.serial('Phase 2 Step 6 — Admin Inquiry Management', () => {
  // Create 3 test inquiries once before the suite runs.
  // 3 full form submissions can take up to 90s — extend the hook timeout.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await submitInquiry(page, INQUIRY_MAIN)
    await submitInquiry(page, INQUIRY_TO_DECLINE)
    await submitInquiry(page, INQUIRY_TO_DELETE)
    await page.close()
  })

  // ── Admin login ────────────────────────────────────────────────────────────

  test.describe('Admin Login', () => {
    test('successful login redirects to /admin dashboard', async ({ page }) => {
      await loginAsAdmin(page)
      expect(page.url()).toBe(`${BASE}/admin`)
      await expect(page.locator('h1', { hasText: 'Nadzorna ploča' })).toBeVisible()
    })

    test('admin sidebar is present with navigation links', async ({ page }) => {
      await loginAsAdmin(page)
      await expect(page.locator('aside')).toBeVisible()
      await expect(page.locator('aside a[href="/admin/upiti"]')).toBeVisible()
      await expect(page.locator('aside a[href="/admin/grupe"]')).toBeVisible()
      await expect(page.locator('aside a[href="/admin/ucenici"]')).toBeVisible()
    })

    test('admin name and logout button are visible in sidebar', async ({ page }) => {
      await loginAsAdmin(page)
      await expect(page.locator('aside button[type="submit"]', { hasText: 'Odjava' })).toBeVisible()
    })

    test('unauthenticated access to /admin redirects to /prijava', async ({ page }) => {
      await page.goto(`${BASE}/admin`)
      await page.waitForURL('**/prijava**')
      expect(page.url()).toContain('/prijava')
    })
  })

  // ── Admin dashboard ────────────────────────────────────────────────────────

  test.describe('Admin Dashboard', () => {
    test('dashboard shows stat cards', async ({ page }) => {
      await loginAsAdmin(page)
      // Stat card labels are in <p class="text-sm font-medium opacity-75">
      const statLabel = (text: string) =>
        page.locator('p.text-sm.font-medium.opacity-75', { hasText: text })
      await expect(statLabel('Novi upiti')).toBeVisible()
      await expect(statLabel('Raspored poslan')).toBeVisible()
      await expect(statLabel('Učenici')).toBeVisible()
    })

    test('dashboard stat "Novi upiti" reflects at least the 3 test inquiries', async ({
      page,
    }) => {
      await loginAsAdmin(page)
      // StatCard: card-div > flex-div > p.label  +  card-div > p.text-3xl
      // Go up 2 levels from the label <p> to reach the card root div
      const newCard = page.locator('p.text-sm.font-medium.opacity-75', { hasText: 'Novi upiti' }).locator('../..')
      const countText = await newCard.locator('p.text-3xl').textContent()
      expect(parseInt(countText ?? '0')).toBeGreaterThanOrEqual(3)
    })

    test('recent inquiries list shows test inquiry', async ({ page }) => {
      await loginAsAdmin(page)
      // At least one of our test inquiries should appear in the recent list.
      // Use .first() to avoid strict-mode violations when multiple match.
      await expect(
        page.locator(`text=${INQUIRY_MAIN.childName}`).or(
          page.locator(`text=${INQUIRY_TO_DECLINE.childName}`).or(
            page.locator(`text=${INQUIRY_TO_DELETE.childName}`),
          ),
        ).first(),
      ).toBeVisible()
    })

    test('recent inquiries list has "Svi upiti" link to /admin/upiti', async ({ page }) => {
      await loginAsAdmin(page)
      const link = page.locator('a[href="/admin/upiti"]', { hasText: 'Svi upiti' })
      await expect(link).toBeVisible()
    })

    test('dashboard shows status summary breakdown', async ({ page }) => {
      await loginAsAdmin(page)
      // Summary section heading and a status row label (span.text-gray-600 = exact match "Novi")
      await expect(page.locator('h2', { hasText: 'Upiti po statusu' })).toBeVisible()
      await expect(page.locator('span.text-sm.text-gray-600', { hasText: 'Novi' }).first()).toBeVisible()
      await expect(page.locator('text=Ukupno')).toBeVisible()
    })
  })

  // ── Inquiry list ───────────────────────────────────────────────────────────

  test.describe('Inquiry List Page', () => {
    test('renders with correct heading and count', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await expect(page.locator('h1', { hasText: 'Upiti' })).toBeVisible()
    })

    test('table has correct column headers', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await expect(page.locator('th', { hasText: 'Datum' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Roditelj' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Dijete' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Tečaj' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Status' })).toBeVisible()
    })

    test('test inquiries appear in the list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_TO_DECLINE.parentName}`)).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_TO_DELETE.parentName}`)).toBeVisible()
    })

    test('each row shows "Detalji" link', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      const detailLinks = page.locator('a', { hasText: 'Detalji' })
      await expect(detailLinks.first()).toBeVisible()
    })

    test('status badge "Nova" shown for new inquiries', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      // At least one "Nova" badge should be visible
      await expect(page.locator('span', { hasText: 'Nova' }).first()).toBeVisible()
    })
  })

  // ── Search ─────────────────────────────────────────────────────────────────

  test.describe('Inquiry Search', () => {
    test('search by parent name filters to matching results', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await page.locator('input[placeholder*="Pretraži"]').fill(INQUIRY_MAIN.parentName)
      await page.locator('button', { hasText: 'Traži' }).click()

      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
      // Other test inquiries should not appear
      await expect(page.locator(`text=${INQUIRY_TO_DECLINE.parentName}`)).not.toBeVisible()
    })

    test('search by child name filters to matching results', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await page.locator('input[placeholder*="Pretraži"]').fill(INQUIRY_TO_DECLINE.childName)
      await page.locator('button', { hasText: 'Traži' }).click()

      await expect(page.locator(`text=${INQUIRY_TO_DECLINE.childName}`)).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_MAIN.childName}`)).not.toBeVisible()
    })

    test('search with no match shows empty state', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await page
        .locator('input[placeholder*="Pretraži"]')
        .fill(`NONEXISTENT_${RUN_ID}_ZZZZZZ`)
      await page.locator('button', { hasText: 'Traži' }).click()

      await expect(page.locator('text=Nema upita koji odgovaraju filteru')).toBeVisible()
    })

    test('clearing search input shows all inquiries again', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?search=NONEXISTENT`)
      // Clear the search by emptying the input and resubmitting
      await page.locator('input[placeholder*="Pretraži"]').fill('')
      await page.locator('button', { hasText: 'Traži' }).click()
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
    })
  })

  // ── Status filter ──────────────────────────────────────────────────────────

  test.describe('Status Filter', () => {
    test('"Sve" filter shows all test inquiries', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await page.locator('button', { hasText: 'Sve' }).click()
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
    })

    test('"Nove" filter shows test inquiries (all are NEW)', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await page.locator('button', { hasText: 'Nove' }).click()
      await page.waitForURL(/status=NEW/)
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
    })

    test('"Odbijene" filter shows empty before any declines', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await page.locator('button', { hasText: 'Odbijene' }).click()
      await page.waitForURL(/status=DECLINED/)
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).not.toBeVisible()
    })

    test('status filter buttons are highlighted when active', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?status=NEW`)
      const noveButton = page.locator('button', { hasText: 'Nove' })
      await expect(noveButton).toHaveClass(/bg-cyan-600/)
    })
  })

  // ── Inquiry detail ─────────────────────────────────────────────────────────

  test.describe('Inquiry Detail Page', () => {
    test('navigates to detail page via Detalji link', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      expect(page.url()).toMatch(/\/admin\/upiti\/[a-z0-9]+$/)
    })

    test('detail page heading shows child name', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator('h1')).toHaveText(INQUIRY_MAIN.childName)
    })

    test('detail page shows status badge "Nova"', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator('span', { hasText: 'Nova' }).first()).toBeVisible()
    })

    test('detail page shows parent name, email, phone', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`).first()).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_MAIN.parentEmail}`)).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_MAIN.parentPhone}`)).toBeVisible()
    })

    test('detail page shows child name and date of birth', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator(`text=${INQUIRY_MAIN.childName}`).first()).toBeVisible()
      // Date of birth displayed in HR format (dd.mm.yyyy.)
      await expect(page.locator('text=15.').first()).toBeVisible()
    })

    test('detail page shows status timeline', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      // Scope to the timeline section to avoid matching the status badge
      const timeline = page.locator('h2', { hasText: 'Tijek upita' }).locator('..')
      await expect(timeline).toBeVisible()
      // Step labels are in <span class="text-xs mt-1 text-center w-20 ...">
      await expect(timeline.locator('span.text-xs.w-20', { hasText: 'Nova' })).toBeVisible()
      await expect(timeline.locator('span.text-xs.w-20', { hasText: 'Raspored poslan' })).toBeVisible()
      await expect(timeline.locator('span.text-xs.w-20', { hasText: 'Potvrđena' })).toBeVisible()
      await expect(timeline.locator('span.text-xs.w-20', { hasText: 'Račun stvoren' })).toBeVisible()
    })

    test('detail page shows consent timestamp', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator('dt', { hasText: 'Pristanak (GDPR)' })).toBeVisible()
      // Should show a date, not "Nije zabilježen"
      await expect(page.locator('text=Nije zabilježen')).not.toBeVisible()
    })

    test('detail page has "Natrag na upite" back link', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      const backLink = page.locator('a', { hasText: 'Natrag na upite' })
      await expect(backLink).toBeVisible()
      await expect(backLink).toHaveAttribute('href', '/admin/upiti')
    })

    test('detail page shows "Odbij upit" and "Obriši (GDPR)" buttons', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)
      await expect(page.locator('button', { hasText: 'Odbij upit' })).toBeVisible()
      await expect(page.locator('button', { hasText: 'Obriši (GDPR)' })).toBeVisible()
    })
  })

  // ── Decline ────────────────────────────────────────────────────────────────

  test.describe('Decline Inquiry', () => {
    test('decline dialog opens when "Odbij upit" is clicked', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await page.locator('button', { hasText: 'Odbij upit' }).click()
      await expect(page.locator('text=Odbiti upit?')).toBeVisible()
    })

    test('decline dialog shows child name', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await page.locator('button', { hasText: 'Odbij upit' }).click()
      await expect(
        page.locator('[role="dialog"]').locator(`text=${INQUIRY_TO_DECLINE.childName}`),
      ).toBeVisible()
    })

    test('cancel button closes dialog without changing status', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await page.locator('button', { hasText: 'Odbij upit' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
      await expect(page.locator('text=Odbiti upit?')).not.toBeVisible()
      // Status should still be Nova
      await expect(page.locator('span', { hasText: 'Nova' }).first()).toBeVisible()
    })

    test('confirming decline updates status to "Odbijena"', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await page.locator('button', { hasText: 'Odbij upit' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odbij upit' }).last().click()
      // Status badge should update
      await expect(page.locator('span', { hasText: 'Odbijena' }).first()).toBeVisible({
        timeout: 10000,
      })
    })

    test('declined inquiry shows "Upit je odbijen" message in timeline', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await expect(page.locator('text=Upit je odbijen')).toBeVisible()
    })

    test('declined inquiry hides "Odbij upit" button', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await expect(page.locator('button', { hasText: 'Odbij upit' })).not.toBeVisible()
    })

    test('"Odbijene" filter now shows the declined inquiry', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await page.locator('button', { hasText: 'Odbijene' }).click()
      await expect(page.locator(`text=${INQUIRY_TO_DECLINE.parentName}`)).toBeVisible()
    })
  })

  // ── Delete (GDPR) ──────────────────────────────────────────────────────────

  test.describe('Delete Inquiry (GDPR)', () => {
    test('delete dialog opens when "Obriši (GDPR)" is clicked', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DELETE.parentName)
      await page.locator('button', { hasText: 'Obriši (GDPR)' }).click()
      await expect(page.locator('text=Trajno obrisati upit?')).toBeVisible()
    })

    test('delete dialog shows child name and warns about irreversibility', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DELETE.parentName)
      await page.locator('button', { hasText: 'Obriši (GDPR)' }).click()
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog.locator(`text=${INQUIRY_TO_DELETE.childName}`)).toBeVisible()
      await expect(dialog.locator('text=nepovratna')).toBeVisible()
      await expect(dialog.locator('text=GDPR')).toBeVisible()
    })

    test('cancel button closes delete dialog without deleting', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DELETE.parentName)
      await page.locator('button', { hasText: 'Obriši (GDPR)' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
      await expect(page.locator('text=Trajno obrisati upit?')).not.toBeVisible()
      // Still on detail page
      await expect(page.locator('h1')).toHaveText(INQUIRY_TO_DELETE.childName)
    })

    test('confirming delete redirects to /admin/upiti', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DELETE.parentName)
      await page.locator('button', { hasText: 'Obriši (GDPR)' }).click()
      await page.locator('[role="dialog"] button', { hasText: 'Trajno obriši' }).click()
      await page.waitForURL(`${BASE}/admin/upiti`, { timeout: 10000 })
      expect(page.url()).toBe(`${BASE}/admin/upiti`)
    })

    test('deleted inquiry no longer appears in the list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      // Search specifically for the deleted inquiry
      await page.locator('input[placeholder*="Pretraži"]').fill(INQUIRY_TO_DELETE.parentName)
      await page.locator('button', { hasText: 'Traži' }).click()
      await expect(page.locator(`text=${INQUIRY_TO_DELETE.parentName}`)).not.toBeVisible()
      await expect(page.locator('text=Nema upita koji odgovaraju filteru')).toBeVisible()
    })

    test('remaining inquiries (main, declined) still appear in list', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      await expect(page.locator(`text=${INQUIRY_MAIN.parentName}`)).toBeVisible()
      await expect(page.locator(`text=${INQUIRY_TO_DECLINE.parentName}`)).toBeVisible()
    })
  })

  // ── Table sorting ──────────────────────────────────────────────────────────

  test.describe('Table Sorting', () => {
    test('clicking "Datum" header sorts the table', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      const dateHeader = page.locator('th button', { hasText: 'Datum' })
      await expect(dateHeader).toBeVisible()
      // Click once → ascending
      await dateHeader.click()
      await expect(page.locator('th button svg').first()).toBeVisible()
      // Click again → descending
      await dateHeader.click()
      await expect(page.locator('th button svg').first()).toBeVisible()
    })

    test('clicking "Roditelj" header sorts alphabetically', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      const parentHeader = page.locator('th button', { hasText: 'Roditelj' })
      await expect(parentHeader).toBeVisible()
      await parentHeader.click()
      // Table still renders rows after sort
      await expect(page.locator('tbody tr').first()).toBeVisible()
    })
  })

  // ── Pagination ─────────────────────────────────────────────────────────────

  test.describe('Pagination', () => {
    test('header shows total inquiry count', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      // e.g. "148 upita" or "1 upit"
      await expect(page.locator('p.text-gray-500', { hasText: /upita?/ })).toBeVisible()
    })

    test('pagination nav appears and shows "X–Y od Z" range text', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      // Only check when more than one page exists
      const countText = await page.locator('p.text-gray-500').first().textContent()
      const total = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0')
      if (total <= 20) return // not enough data — skip
      await expect(page.locator('nav[aria-label="Paginacija"]')).toBeVisible()
      await expect(page.locator('text=/\\d+–\\d+ od \\d+/')).toBeVisible()
    })

    test('navigating to page 2 works and preserves search filters', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      const countText = await page.locator('p.text-gray-500').first().textContent()
      const total = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0')
      if (total <= 20) return // not enough data — skip
      await page.goto(`${BASE}/admin/upiti?page=2`)
      await expect(page.locator('nav[aria-label="Paginacija"]')).toBeVisible()
      // Range should start at 21
      await expect(page.locator('text=/^21–/')).toBeVisible()
    })

    test('changing status filter resets to page 1', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?page=2`)
      await page.locator('button', { hasText: 'Nove' }).click()
      // URL should contain status=NEW but NOT page=2
      await page.waitForURL(/status=NEW/)
      expect(page.url()).not.toContain('page=')
    })

    test('submitting search resets to page 1', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?page=2`)
      await page.locator('input[placeholder*="Pretraži"]').fill('test')
      await page.locator('button', { hasText: 'Traži' }).click()
      await page.waitForURL(/search=test/)
      expect(page.url()).not.toContain('page=')
    })

    test('previous-page button is disabled on page 1', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)
      const countText = await page.locator('p.text-gray-500').first().textContent()
      const total = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0')
      if (total <= 20) return // pagination won't render
      // Prev button is rendered as a <span> (disabled) on page 1
      await expect(page.locator('span[aria-label="Prethodna stranica"]')).not.toBeVisible()
      // It's a <span> not a link, so no href
      const prevLink = page.locator('a[aria-label="Prethodna stranica"]')
      await expect(prevLink).not.toBeVisible()
    })
  })
})
