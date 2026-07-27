import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEWS / ARTICLES
// The association publishes news articles (competitions, workshops, etc.).
// Validates the listing page shows articles, individual articles load
// correctly with a title, and invalid slugs return 404.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('News & Articles — Listing, detail pages, and 404 handling', () => {
  test('News listing page shows article cards with links', async ({ page }) => {
    await test.step('Navigate to /novosti', async () => {
      await page.goto(`${BASE}/novosti`)
    })

    await test.step('Count article links (a[href*="/novosti/"]) and verify at least 1 exists', async () => {
      const articleLinks = page.locator('a[href*="/novosti/"]')
      const count = await articleLinks.count()
      expect(count, 'News listing should contain at least 1 article link').toBeGreaterThan(0)
    })
  })

  test('Clicking the first article navigates to a valid detail page with a title', async ({ page }) => {
    await test.step('Navigate to /novosti and get the first article link', async () => {
      await page.goto(`${BASE}/novosti`)
    })

    let href: string | null = null
    await test.step('Extract the href from the first article link', async () => {
      href = await page.locator('a[href*="/novosti/"]').first().getAttribute('href')
      expect(href, 'First article should have an href').toBeTruthy()
    })

    await test.step('Navigate to the article detail page and verify HTTP 200', async () => {
      const url = href!.startsWith('http') ? href! : `${BASE}${href}`
      const response = await page.goto(url)
      expect(response?.status()).toBe(200)
    })

    await test.step('Verify the article has a visible <h1> title', async () => {
      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 10000 })
      const title = await h1.textContent()
      expect(title?.length, 'Article title should not be empty').toBeGreaterThan(0)
    })
  })

  test('Non-existent article slug returns HTTP 404', async ({ page }) => {
    await test.step('Navigate to /novosti/non-existent-article-slug-12345', async () => {
      const response = await page.goto(`${BASE}/novosti/non-existent-article-slug-12345`)
      expect(response?.status()).toBe(404)
    })
  })

  test('City filter: pills render, ?grad=sibenik activates Šibenik, unknown grad falls back to Sve', async ({ page }) => {
    // Scope to <main>: the navbar's Lokacije submenu renders "Split" and "Šibenik"
    // links too, so an unscoped getByRole matches two elements and trips strict mode.
    const pill = (label: string) =>
      page.getByRole('main').getByRole('link', { name: label, exact: true })

    await test.step('Default /novosti shows all three pills with "Sve" active', async () => {
      await page.goto(`${BASE}/novosti`)
      for (const label of ['Sve', 'Split', 'Šibenik']) {
        await expect(pill(label), `filter pill "${label}" is rendered`).toBeVisible()
      }
      await expect(
        pill('Sve'),
        '"Sve" pill is marked as the active filter',
      ).toHaveAttribute('aria-current', 'page')
    })

    await test.step('?grad=sibenik marks the Šibenik pill active and keeps grad in pagination', async () => {
      await page.goto(`${BASE}/novosti?grad=sibenik`)
      await expect(
        pill('Šibenik'),
        'Šibenik pill is active under ?grad=sibenik',
      ).toHaveAttribute('aria-current', 'page')

      // Pagination only renders past one page of articles — assert the filter
      // is preserved in its hrefs whenever it is present.
      const pagLinks = page.locator('a[href*="stranica="]')
      const count = await pagLinks.count()
      for (let i = 0; i < count; i++) {
        const href = await pagLinks.nth(i).getAttribute('href')
        expect(href, 'pagination link preserves the grad filter').toContain('grad=sibenik')
      }
    })

    await test.step('Unknown ?grad=zagreb falls back to the unfiltered list', async () => {
      await page.goto(`${BASE}/novosti?grad=zagreb`)
      await expect(
        pill('Sve'),
        'invalid grad param resolves to "Sve"',
      ).toHaveAttribute('aria-current', 'page')
    })
  })
})
