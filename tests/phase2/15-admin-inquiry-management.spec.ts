import { test, expect, type Page } from '@playwright/test'
import { clickUntilVisible, submitUntilUrl } from '../helpers/hydration'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 6 — Admin Dashboard + Inquiry Management
// Tests run serially: beforeAll creates 3 inquiries, then tests verify
// list, search, filter, detail, decline, and delete (GDPR) features.
// Requires: dev server on localhost:3000, seeded admin user.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
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

  // Step 1 — parent info; clickUntilVisible retries the Dalje click in case
  // the dev-server-warmed page hasn't hydrated yet when the click arrives.
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

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
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
      await expect(statLabel('Ukupno upita')).toBeVisible()
      await expect(statLabel('Račun stvoren')).toBeVisible()
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
      // Scope "Ukupno" to the status-summary block (stat card "Ukupno upita" also matches bare text=Ukupno)
      const summaryBlock = page.locator('h2', { hasText: 'Upiti po statusu' }).locator('..')
      await expect(summaryBlock.getByText('Ukupno', { exact: true })).toBeVisible()
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
    // 3 positive paths merged into 1 flow test (shares login + initial goto);
    // the negative no-match case stays isolated so a regression in one path
    // can't mask a regression in the other.
    test('positive paths: parent-name search → child-name search → clear restores all', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await test.step('Search by parent name filters down to that row only', async () => {
        await page.locator('input[placeholder*="Pretraži"]').fill(INQUIRY_MAIN.parentName)
        await page.locator('button', { hasText: 'Traži' }).click()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`),
          'searched parent row is visible',
        ).toBeVisible()
        await expect(
          page.locator(`text=${INQUIRY_TO_DECLINE.parentName}`),
          'other parent rows are filtered out',
        ).not.toBeVisible()
      })

      await test.step('Search by child name filters down to that row only', async () => {
        await page
          .locator('input[placeholder*="Pretraži"]')
          .fill(INQUIRY_TO_DECLINE.childName)
        await page.locator('button', { hasText: 'Traži' }).click()
        await expect(
          page.locator(`text=${INQUIRY_TO_DECLINE.childName}`),
          'searched child row is visible',
        ).toBeVisible()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.childName}`),
          'other child rows are filtered out',
        ).not.toBeVisible()
      })

      await test.step('Clearing the search input restores the full list', async () => {
        await page.locator('input[placeholder*="Pretraži"]').fill('')
        await page.locator('button', { hasText: 'Traži' }).click()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`),
          'main parent reappears after clearing search',
        ).toBeVisible()
      })
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
  })

  // ── Status filter ──────────────────────────────────────────────────────────

  test.describe('Status Filter', () => {
    test('flow paths: Sve → Nove → Odbijene navigate and filter correctly', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await test.step('"Sve" filter shows the main test inquiry', async () => {
        await page.locator('button', { hasText: 'Sve' }).click()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`),
          'main inquiry is listed under "Sve"',
        ).toBeVisible()
      })

      await test.step('"Nove" filter navigates with ?status=NEW and shows new inquiries', async () => {
        await page.locator('button', { hasText: 'Nove' }).click()
        await page.waitForURL(/status=NEW/)
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`),
          'main inquiry (status=NEW) is listed under "Nove"',
        ).toBeVisible()
      })

      await test.step('"Odbijene" filter navigates with ?status=DECLINED and hides NEW inquiries', async () => {
        await page.locator('button', { hasText: 'Odbijene' }).click()
        await page.waitForURL(/status=DECLINED/)
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`),
          'main (NEW) inquiry is hidden under "Odbijene"',
        ).not.toBeVisible()
      })
    })

    // Stays isolated from the flow test: this asserts CSS state (highlight),
    // not navigation behaviour — different failure mode.
    test('active status filter button is highlighted', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?status=NEW`)
      const noveButton = page.locator('button', { hasText: 'Nove' })
      await expect(noveButton).toHaveClass(/bg-cyan-600/)
    })
  })

  // ── Inquiry detail ─────────────────────────────────────────────────────────

  test.describe('Inquiry Detail Page', () => {
    // All 9 originally-discrete display assertions merged into 1 pure-render
    // test that visits the detail page once. Every original `expect()` is
    // preserved as its own `test.step()` so the HTML report still pinpoints
    // which field broke.
    test('pure display: heading + status + parent + child + DOB + timeline + consent all render', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)

      await test.step('URL matched the /admin/upiti/[id] pattern', async () => {
        expect(page.url(), 'detail URL has the expected shape').toMatch(
          /\/admin\/upiti\/[a-z0-9]+$/,
        )
      })

      await test.step('Heading shows the child full name', async () => {
        await expect(page.locator('h1'), 'detail <h1> is the child name').toHaveText(
          INQUIRY_MAIN.childName,
        )
      })

      await test.step('Status badge "Nova" is visible', async () => {
        await expect(
          page.locator('span', { hasText: 'Nova' }).first(),
          'status badge shows "Nova" for a fresh inquiry',
        ).toBeVisible()
      })

      await test.step('Parent name, email and phone are all rendered', async () => {
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentName}`).first(),
          'parent name is on the page',
        ).toBeVisible()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentEmail}`),
          'parent email is on the page',
        ).toBeVisible()
        await expect(
          page.locator(`text=${INQUIRY_MAIN.parentPhone}`),
          'parent phone is on the page',
        ).toBeVisible()
      })

      await test.step('Child name and date-of-birth are rendered', async () => {
        await expect(
          page.locator(`text=${INQUIRY_MAIN.childName}`).first(),
          'child name is on the page',
        ).toBeVisible()
        await expect(
          page.locator('text=15.').first(),
          'child DOB day "15." is rendered (HR dd.mm.yyyy. format)',
        ).toBeVisible()
      })

      await test.step('Status timeline shows both flow steps', async () => {
        const timeline = page.locator('h2', { hasText: 'Tijek upita' }).locator('..')
        await expect(timeline, 'timeline panel is visible').toBeVisible()
        await expect(
          timeline.locator('span.text-xs.w-20', { hasText: 'Nova' }),
          'timeline shows "Nova" step',
        ).toBeVisible()
        await expect(
          timeline.locator('span.text-xs.w-20', { hasText: 'Račun stvoren' }),
          'timeline shows "Račun stvoren" step',
        ).toBeVisible()
      })

      await test.step('GDPR consent timestamp section is rendered', async () => {
        await expect(
          page.locator('dt', { hasText: 'Pristanak (GDPR)' }),
          'GDPR consent <dt> is present',
        ).toBeVisible()
        await expect(
          page.locator('text=Nije zabilježen'),
          'consent is NOT marked as "Nije zabilježen" (consent was given)',
        ).not.toBeVisible()
      })
    })

    test('action affordances: back link + Odbij/Obriši buttons all present', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_MAIN.parentName)

      await test.step('"Natrag na upite" link points to /admin/upiti', async () => {
        const backLink = page.locator('a', { hasText: 'Natrag na upite' })
        await expect(backLink, 'back link is visible').toBeVisible()
        await expect(backLink, 'back link href is /admin/upiti').toHaveAttribute(
          'href',
          '/admin/upiti',
        )
      })

      await test.step('"Odbij upit" and "Obriši (GDPR)" action buttons are both visible', async () => {
        await expect(
          page.locator('button', { hasText: 'Odbij upit' }),
          '"Odbij upit" button is visible',
        ).toBeVisible()
        await expect(
          page.locator('button', { hasText: 'Obriši (GDPR)' }),
          '"Obriši (GDPR)" button is visible',
        ).toBeVisible()
      })
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

    test('submit button is disabled when reason textarea is empty', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await clickUntilVisible(
        page.locator('button', { hasText: 'Odbij upit' }),
        page.locator('#decline-reason'),
      )
      const submit = page.locator('[role="dialog"] button', { hasText: 'Odbij upit' }).last()
      await expect(submit).toBeDisabled()
      // Typing too few characters still keeps it disabled
      await page.locator('#decline-reason').fill('ab')
      await expect(submit).toBeDisabled()
      // Close without submitting
      await page.locator('[role="dialog"] button', { hasText: 'Odustani' }).click()
    })

    test('confirming decline updates status to "Odbijena"', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await clickUntilVisible(
        page.locator('button', { hasText: 'Odbij upit' }),
        page.locator('#decline-reason'),
      )
      await page
        .locator('#decline-reason')
        .fill('Test razlog — dijete je premlado za SLR1.')
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

    test('declined inquiry shows captured rejection reason + timestamp', async ({ page }) => {
      await loginAsAdmin(page)
      await openInquiryDetail(page, INQUIRY_TO_DECLINE.parentName)
      await expect(page.locator('text=Razlog odbijanja')).toBeVisible()
      await expect(
        page.locator('text=Test razlog — dijete je premlado za SLR1.'),
      ).toBeVisible()
      await expect(
        page.getByText(/Odbijeno\s+\d{2}\.\s*\d{2}\.\s*\d{4}\.\s+u\s+\d{2}:\d{2}/),
      ).toBeVisible()
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
    // Lifecycle merge: total-count → nav-range → page-2 → reset-on-search →
    // prev-disabled — all share the same "is the page big enough to paginate?"
    // guard, so it's wasteful to re-check it per test.
    test('lifecycle: total count → page 2 nav → reset on search → prev-disabled on page 1', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti`)

      await test.step('Header shows the total inquiry count', async () => {
        await expect(
          page.locator('p.text-gray-500').filter({ hasText: /^\d+\s+upita?$/ }),
          'total-inquiry-count caption is visible',
        ).toBeVisible()
      })

      const countText = await page.locator('p.text-gray-500').first().textContent()
      const total = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0')
      test.skip(total <= 20, `only ${total} inquiries — page 2 doesn't render`)

      await test.step('Pagination nav and "X–Y od Z" range render when > 1 page', async () => {
        await expect(
          page.locator('nav[aria-label="Paginacija"]'),
          'pagination nav is visible',
        ).toBeVisible()
        await expect(
          page.locator('text=/\\d+–\\d+ od \\d+/'),
          'range text "X–Y od Z" is rendered',
        ).toBeVisible()
      })

      await test.step('Page 2 renders and starts at row 21', async () => {
        await page.goto(`${BASE}/admin/upiti?page=2`)
        await expect(
          page.locator('nav[aria-label="Paginacija"]'),
          'pagination nav still visible on page 2',
        ).toBeVisible()
        await expect(
          page.locator('text=/^21–/'),
          'range text starts at row 21 on page 2',
        ).toBeVisible()
      })

      await test.step('Submitting a search resets page param', async () => {
        await page.goto(`${BASE}/admin/upiti?page=2`)
        await page.locator('input[placeholder*="Pretraži"]').fill('test')
        await page.locator('button', { hasText: 'Traži' }).click()
        await page.waitForURL(/search=test/)
        expect(page.url(), 'page= dropped after search submit').not.toContain('page=')
      })

      await test.step('Previous-page anchor is absent on page 1', async () => {
        await page.goto(`${BASE}/admin/upiti`)
        await expect(
          page.locator('span[aria-label="Prethodna stranica"]'),
          'prev <span> not visible on page 1',
        ).not.toBeVisible()
        await expect(
          page.locator('a[aria-label="Prethodna stranica"]'),
          'prev <a> not rendered on page 1 (disabled)',
        ).not.toBeVisible()
      })
    })

    // Stays isolated — this is the only test that mutates page = 2 → status
    // = NEW and asserts a side effect on URL. Merging into the lifecycle
    // above would muddle which step caused a regression.
    test('changing status filter resets to page 1', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/upiti?page=2`)
      await page.locator('button', { hasText: 'Nove' }).click()
      // URL should contain status=NEW but NOT page=2
      await page.waitForURL(/status=NEW/)
      expect(page.url()).not.toContain('page=')
    })
  })
})
