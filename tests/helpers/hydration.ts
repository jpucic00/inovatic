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
  const total = options.timeout ?? 45000
  const perAttempt = options.perAttemptMs ?? 1500
  const deadline = Date.now() + total
  let clickError: string | null = null
  while (Date.now() < deadline) {
    if (await expectVisible.isVisible().catch(() => false)) return
    // Record why the click itself failed. A permanently disabled control (a
    // full group's radio, a submit gated on a missing required field) never
    // becomes clickable, and without this the run reports only "expected
    // element not visible" in whatever test happened to own the beforeAll.
    await clickLocator
      .click({ timeout: 5000 })
      .catch((err: Error) => {
        clickError = err.message.split('\n')[0]
      })
    try {
      await expectVisible.waitFor({ state: 'visible', timeout: perAttempt })
      return
    } catch {
      // hydration not ready yet; loop and retry
    }
  }
  await expect(
    expectVisible,
    `hydration retry loop exhausted after ${total}ms${clickError ? ` — last click error: ${clickError}` : ''}`,
  ).toBeVisible({ timeout: 10000 })
}

export async function submitUntilUrl(
  page: Page,
  submitLocator: Locator,
  url: string | RegExp,
  options: { timeout?: number; perAttemptMs?: number } = {},
): Promise<void> {
  // Keep the total comfortably under Playwright's 60s per-test timeout —
  // together with the final check below the worst case must still fit, or the
  // test dies before this helper can report anything useful.
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
  // The loop budget is already spent by here, so give the last check a real
  // window rather than 5s — on a dev server that has been compiling suites for
  // an hour, that difference is the whole failure.
  await page.waitForURL(url, { timeout: 10000 })
}
