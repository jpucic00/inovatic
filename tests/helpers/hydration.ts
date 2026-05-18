import { expect, type Locator, type Page } from '@playwright/test'

// Playwright fires native DOM clicks; a click that arrives before React has
// attached its onClick handler silently no-ops. On the Next.js dev server,
// route hydration races the test runner, especially after many specs have
// warmed the compiler. These helpers retry the click until the expected
// post-click DOM change occurs.

export async function clickUntilVisible(
  clickLocator: Locator,
  expectVisible: Locator,
  options: { timeout?: number; perAttemptMs?: number } = {},
): Promise<void> {
  const total = options.timeout ?? 30000
  const perAttempt = options.perAttemptMs ?? 1500
  const deadline = Date.now() + total
  while (Date.now() < deadline) {
    if (await expectVisible.isVisible().catch(() => false)) return
    await clickLocator.click({ timeout: 5000 }).catch(() => undefined)
    try {
      await expectVisible.waitFor({ state: 'visible', timeout: perAttempt })
      return
    } catch {
      // hydration not ready yet; loop and retry
    }
  }
  await expect(expectVisible).toBeVisible({ timeout: 5000 })
}

export async function submitUntilUrl(
  page: Page,
  submitLocator: Locator,
  url: string | RegExp,
  options: { timeout?: number; perAttemptMs?: number } = {},
): Promise<void> {
  const total = options.timeout ?? 45000
  // Long first attempt: the server action runs, then the destination route
  // (/admin, /nastavnik, /portal) cold-compiles in the Next.js dev server,
  // which can take 5–15s on first hit. Only retry the click once the page
  // has clearly NOT navigated — a tight retry loop just keeps clicking a
  // disabled "Prijavljivanje..." button.
  const perAttempt = options.perAttemptMs ?? 20000
  const deadline = Date.now() + total
  const matches = () =>
    typeof url === 'string' ? page.url() === url : url.test(page.url())
  while (Date.now() < deadline) {
    if (matches()) return
    await submitLocator.click({ timeout: 5000 }).catch(() => undefined)
    try {
      await page.waitForURL(url, { timeout: perAttempt })
      return
    } catch {
      // hydration not ready yet; loop and retry
    }
  }
  await page.waitForURL(url, { timeout: 5000 })
}
