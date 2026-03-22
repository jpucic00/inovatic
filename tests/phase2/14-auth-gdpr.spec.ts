import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 5 — Auth Polish + GDPR Foundations
// Tests for login page, navbar login link, privacy policy, footer link,
// GDPR consent checkbox on inquiry form, and auth redirects.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Login Page', () => {
  test('renders login form with email, password, and submit button', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    await expect(page.locator('h1')).toHaveText('Prijava')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText('Prijavi se')
  })

  test('shows validation errors on empty submission', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    await page.locator('input[type="email"]').click()
    await page.locator('input[type="password"]').click()
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText('Unesite email adresu')).toBeVisible()
    await expect(page.getByText('Unesite lozinku')).toBeVisible()
  })

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    await page.locator('input[type="email"]').fill('not-an-email')
    await page.locator('input[type="password"]').click()
    await expect(page.locator('text=Unesite valjanu email adresu')).toBeVisible()
  })

  test('shows error message on wrong credentials', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    await page.locator('input[type="email"]').fill('wrong@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('text=Pogrešan email ili lozinka')).toBeVisible({ timeout: 10000 })
  })

  test('uses shared Logo component', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    const logo = page.locator('img[alt*="Inovatic"]').or(page.locator('text=INOVATIC'))
    await expect(logo.first()).toBeVisible()
  })

  test('has back link to homepage', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    const backLink = page.locator('a[href="/"]', { hasText: 'Natrag' })
    await expect(backLink).toBeVisible()
  })
})

test.describe('Navbar Login Link', () => {
  test('navbar contains Prijava link on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${BASE}/`)
    const loginLink = page.locator('header a[href="/prijava"]')
    await expect(loginLink).toBeVisible()
    await expect(loginLink).toHaveText(/Prijava/)
  })

  test('mobile menu contains Prijava link', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/`)
    const hamburger = page.locator('button[aria-label*="meni"]')
    await hamburger.click()
    // The mobile menu login link is inside the absolutely-positioned dropdown
    const mobileMenu = page.locator('.md\\:hidden[class*="absolute"]')
    const loginLink = mobileMenu.locator('a[href="/prijava"]')
    await expect(loginLink).toBeVisible()
  })
})

test.describe('Privacy Policy Page', () => {
  test('renders at /politika-privatnosti with correct heading', async ({ page }) => {
    const response = await page.goto(`${BASE}/politika-privatnosti`)
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toHaveText('Politika privatnosti')
  })

  test('contains key GDPR sections', async ({ page }) => {
    await page.goto(`${BASE}/politika-privatnosti`)
    await expect(page.locator('text=Voditelj obrade')).toBeVisible()
    await expect(page.locator('text=Koje podatke prikupljamo')).toBeVisible()
    await expect(page.locator('text=Pravna osnova obrade')).toBeVisible()
    await expect(page.locator('text=Vaša prava')).toBeVisible()
  })

  test('has correct metadata', async ({ page }) => {
    await page.goto(`${BASE}/politika-privatnosti`)
    const title = await page.title()
    expect(title).toContain('Politika privatnosti')
  })
})

test.describe('Footer Privacy Link', () => {
  test('footer contains Politika privatnosti link', async ({ page }) => {
    await page.goto(`${BASE}/`)
    const footerLink = page.locator('footer a[href="/politika-privatnosti"]')
    await expect(footerLink).toBeVisible()
    await expect(footerLink).toHaveText('Politika privatnosti')
  })
})

test.describe('GDPR Consent on Inquiry Form', () => {
  test('consent checkbox appears on step 3 after filling steps 1 and 2', async ({ page }) => {
    await page.goto(`${BASE}/upisi`)

    // Step 1 — fill parent info
    await page.locator('#parentName').fill('Ivan Horvat')
    await page.locator('#parentEmail').fill('ivan@example.com')
    await page.locator('#parentPhone').fill('0991234567')
    await page.locator('button', { hasText: 'Dalje' }).click()

    // Step 2 — fill child info
    await page.locator('#childFirstName').fill('Ana')
    await page.locator('#childLastName').fill('Horvat')
    await page.locator('#dob-day').selectOption('15')
    await page.locator('#dob-month').selectOption('03')
    await page.locator('#dob-year').selectOption('2018')
    await page.locator('button', { hasText: 'Dalje' }).click()

    // Step 3 — verify consent checkbox is present
    const consentCheckbox = page.locator('input[type="checkbox"][name="consent"]')
    await expect(consentCheckbox).toBeVisible()

    // Verify consent label text and privacy policy link
    const consentLabel = page.locator('text=politikom privatnosti')
    await expect(consentLabel).toBeVisible()

    const privacyLink = page.locator('a[href="/politika-privatnosti"]', { hasText: 'politikom privatnosti' })
    await expect(privacyLink).toBeVisible()
    await expect(privacyLink).toHaveAttribute('target', '_blank')
  })

  test('form shows validation error when consent is not checked', async ({ page }) => {
    await page.goto(`${BASE}/upisi`)

    // Step 1
    await page.locator('#parentName').fill('Ivan Horvat')
    await page.locator('#parentEmail').fill('ivan@example.com')
    await page.locator('#parentPhone').fill('0991234567')
    await page.locator('button', { hasText: 'Dalje' }).click()

    // Step 2
    await page.locator('#childFirstName').fill('Ana')
    await page.locator('#childLastName').fill('Horvat')
    await page.locator('#dob-day').selectOption('15')
    await page.locator('#dob-month').selectOption('03')
    await page.locator('#dob-year').selectOption('2018')
    await page.locator('button', { hasText: 'Dalje' }).click()

    // Step 3 — select grade but submit without checking consent
    await page.locator('select[name="grade"]').selectOption('3')
    await page.locator('button[type="submit"]').click()

    // Expect validation error
    await expect(page.locator('text=Morate pristati na obradu osobnih podataka')).toBeVisible()
  })
})

test.describe('Auth Redirects', () => {
  test('/admin redirects to /prijava for unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin`)
    await page.waitForURL('**/prijava**')
    expect(page.url()).toContain('/prijava')
  })

  test('/nastavnik redirects to /prijava for unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL('**/prijava**')
    expect(page.url()).toContain('/prijava')
  })

  test('/portal redirects to /prijava for unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/portal`)
    await page.waitForURL('**/prijava**')
    expect(page.url()).toContain('/prijava')
  })
})
