import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOOTER
// The footer appears on every page and should contain contact information
// (email, phone) and valid internal links to key pages.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Footer — Contact info and internal links', () => {
  test('Footer contains contact information (email address or phone number)', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Verify <footer> is visible', async () => {
      const footer = page.locator('footer')
      await expect(footer).toBeVisible()
    })

    await test.step('Check footer text for email (@) or Croatian phone number (+385)', async () => {
      const text = await page.locator('footer').textContent()
      const hasContact = text?.includes('@') || text?.includes('+385')
      expect(hasContact, 'Footer should contain an email address or phone number').toBeTruthy()
    })
  })

  test('All internal footer links return HTTP 200 (no broken links)', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    const brokenLinks: string[] = []

    await test.step('Extract all footer <a> tags with internal hrefs (starting with /)', async () => {
      const footerLinks = page.locator('footer a')
      const count = await footerLinks.count()

      for (let i = 0; i < count; i++) {
        const href = await footerLinks.nth(i).getAttribute('href')
        if (href && href.startsWith('/')) {
          const resp = await page.request.get(`${BASE}${href}`)
          if (resp.status() >= 400) {
            brokenLinks.push(`${resp.status()} ${href}`)
          }
        }
      }
    })

    await test.step('Assert no footer links returned HTTP errors', async () => {
      expect(brokenLinks, `Broken links: ${brokenLinks.join(', ')}`).toHaveLength(0)
    })
  })
})
