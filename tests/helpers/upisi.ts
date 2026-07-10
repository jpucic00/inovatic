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
 * Select the city and fill the parent-contact fields of Step 1 of the /upisi
 * inquiry form, then advance to Step 2. Assumes the page is already on /upisi.
 * Extracted so the mandatory city dropdown lives in exactly one place across
 * the inquiry specs — the field is required, so every Step-1 flow must set it.
 */
export async function fillInquiryStep1(page: Page, data: InquiryStep1Data): Promise<void> {
  // The city dropdown is only on /upisi — radionica pages (/radionice/[slug])
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
