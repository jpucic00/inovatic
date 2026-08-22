import { type Page } from '@playwright/test'
import { clickUntilVisible } from './hydration'

interface InquiryStep1Data {
  parentName: string
  parentEmail: string
  parentPhone: string
  /** Mandatory Step-1 city dropdown; defaults to SPLIT (the seed data's city). */
  city?: 'SPLIT' | 'SIBENIK'
}

/**
 * Select the city and fill the parent-contact fields of Step 1 of the /prijava
 * inquiry form, then advance to Step 2. Assumes the page is already on /prijava.
 * Extracted so the mandatory city dropdown lives in exactly one place across
 * the inquiry specs — the field is required, so every Step-1 flow must set it.
 */
export async function fillInquiryStep1(page: Page, data: InquiryStep1Data): Promise<void> {
  // The city dropdown is only on /prijava — radionica pages (/radionice/[slug])
  // preselect the city and render no dropdown, so select it only when present.
  const citySelect = page.locator('#city')
  if ((await citySelect.count()) > 0) {
    await citySelect.selectOption(data.city ?? 'SPLIT')
  }
  await page.locator('#parentName').fill(data.parentName)
  await page.locator('#parentEmail').fill(data.parentEmail)
  await page.locator('#parentPhone').fill(data.parentPhone)
  await clickUntilVisible(
    page.locator('button', { hasText: 'Dalje' }),
    page.locator('#childFirstName'),
  )
}

/**
 * Answer Step 3's "Način plaćanja" dropdown when the current selection renders
 * it. Mandatory since the payment question landed: `isPaymentOptionRequired`
 * makes the field shown and required by one condition, so an SLR sign-up that
 * leaves it blank is blocked client-side and never reaches the success screen.
 *
 * Conditional on presence, for the same reason `fillInquiryStep1` treats the
 * city dropdown that way: radionice and the competitive program offer no choice
 * (they settle by akontacija and by month), so the select simply is not there
 * and those flows must stay untouched.
 */
export async function selectPaymentOptionIfShown(page: Page): Promise<void> {
  const paymentSelect = page.locator('select#paymentOption')
  if ((await paymentSelect.count()) === 0) return
  const values = await paymentSelect
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
  if (values.length > 0) await paymentSelect.selectOption(values[0])
}
