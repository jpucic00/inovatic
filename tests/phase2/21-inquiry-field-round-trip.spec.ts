import { test, expect, type Page } from '@playwright/test'
import { BASE, loginAsAdmin } from '../helpers/phase3'
import { clickUntilVisible } from '../helpers/hydration'
import { fillInquiryStep1 } from '../helpers/upisi'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Inquiry field round-trip: childGrade + referralSource
// Pins the form → DB → admin-detail round-trip for the two fields collected
// on Step 3 of the public inquiry form: `grade` (mapped to childGrade via
// GRADE_LABELS on render) and `referralSource` (rendered verbatim, or
// 'Nije navedeno' fallback when empty).
// Requires: dev server on localhost:3000, seeded admin user.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Unique per test run so each run's data is identifiable even if old data exists
const RUN_ID = Date.now().toString().slice(-6)

interface InquiryData {
  parentName: string
  parentEmail: string
  parentPhone: string
  childFirstName: string
  childLastName: string
  dobDay: string
  dobMonth: string
  dobYear: string
  grade: string
  referralSource: string
}

const INQUIRY_FILLED: InquiryData = {
  parentName: `Round Filled ${RUN_ID}`,
  parentEmail: `round.filled.${RUN_ID}@test.com`,
  parentPhone: '0911223344',
  childFirstName: 'Mara',
  childLastName: `Round ${RUN_ID}`,
  dobDay: '12',
  dobMonth: '04',
  dobYear: '2016',
  grade: '5',
  referralSource: 'Instagram',
}

const INQUIRY_EMPTY_REFERRAL: InquiryData = {
  parentName: `Round Empty ${RUN_ID}`,
  parentEmail: `round.empty.${RUN_ID}@test.com`,
  parentPhone: '0911556677',
  childFirstName: 'Ivo',
  childLastName: `Round ${RUN_ID}`,
  dobDay: '3',
  dobMonth: '11',
  dobYear: '2020',
  grade: 'predskolci',
  referralSource: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function submitInquiry(page: Page, data: InquiryData) {
  await page.goto(`${BASE}/upisi`)

  // Step 1 — city + parent info
  await fillInquiryStep1(page, data)

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

  // Step 3 — grade, optional referralSource, consent + submit
  await page.locator('select[name="grade"]').selectOption(data.grade)
  // A termin is mandatory whenever the chosen grade has an open, non-full group
  // (enforced client-side and mirrored server-side as TERMIN_REQUIRED), so take
  // the first real option when the dropdown offers one.
  // The enabled select only renders when the grade's level has an open program;
  // otherwise a disabled placeholder (no id) takes its place and termin is optional.
  const terminSelect = page.locator('select#scheduledGroupId')
  if ((await terminSelect.count()) > 0) {
    const values = await terminSelect
      .locator('option')
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value).filter(Boolean))
    if (values.length > 0) await terminSelect.selectOption(values[0])
  }
  if (data.referralSource) {
    await page.locator('#referralSource').selectOption(data.referralSource)
  }
  await page.locator('input[name="consent"]').check()
  await clickUntilVisible(
    page.locator('button', { hasText: 'Pošalji upit' }),
    page.locator('text=Upit je poslan!'),
    { timeout: 30000 },
  )
}

async function openInquiryDetail(page: Page, parentName: string) {
  // Navigate directly with the search param so the server renders pre-filtered results
  await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(parentName)}`)
  await expect(page.locator('a', { hasText: 'Detalji' })).toHaveCount(1)
  await page.locator('a', { hasText: 'Detalji' }).click()
  await page.waitForURL(/\/admin\/upiti\/[a-z0-9]+/)
}

// Locate the <dd> sibling of a <dt> matching a given label.
// DetailRow markup (admin/upiti/[id]/page.tsx:37-43): <dt>{label}</dt><dd>{value}</dd>.
function detailValue(page: Page, label: string) {
  return page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]')
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.serial('Inquiry field round-trip — childGrade + referralSource', () => {
  test.beforeAll(async ({ browser }) => {
    // 2 full form submissions can take ~60s — extend the hook timeout.
    test.setTimeout(120000)
    const page = await browser.newPage()
    await submitInquiry(page, INQUIRY_FILLED)
    await submitInquiry(page, INQUIRY_EMPTY_REFERRAL)
    await page.close()
  })

  test('filled inquiry: admin shows mapped grade label "5. razred"', async ({ page }) => {
    await loginAsAdmin(page)
    await openInquiryDetail(page, INQUIRY_FILLED.parentName)
    await expect(detailValue(page, 'Razred')).toHaveText('5. razred')
  })

  test('filled inquiry: admin shows referralSource verbatim "Instagram"', async ({ page }) => {
    await loginAsAdmin(page)
    await openInquiryDetail(page, INQUIRY_FILLED.parentName)
    await expect(detailValue(page, 'Izvor saznanja')).toHaveText('Instagram')
  })

  test('predskolci inquiry: admin shows mapped grade label "Predškolci"', async ({ page }) => {
    await loginAsAdmin(page)
    await openInquiryDetail(page, INQUIRY_EMPTY_REFERRAL.parentName)
    await expect(detailValue(page, 'Razred')).toHaveText('Predškolci')
  })

  test('inquiry without referralSource: admin shows "Nije navedeno" fallback', async ({ page }) => {
    await loginAsAdmin(page)
    await openInquiryDetail(page, INQUIRY_EMPTY_REFERRAL.parentName)
    await expect(detailValue(page, 'Izvor saznanja')).toHaveText('Nije navedeno')
  })
})
