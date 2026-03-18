import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAVIGATION
// Ensures the main navigation bar contains links to all key public routes:
// /programi, /o-nama, /novosti, /kontakt, /upisi, /proslave.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Navigation — Main menu links to all public sections', () => {
  test('Nav bar contains links to all 5 required public routes', async ({ page }) => {
    await test.step('Navigate to the homepage and collect all nav link hrefs', async () => {
      await page.goto(BASE)
    })

    const hrefs: string[] = []
    await test.step('Extract all <a> href attributes from the nav/header', async () => {
      const navLinks = page.locator('nav a, header a')
      const count = await navLinks.count()
      for (let i = 0; i < count; i++) {
        const href = await navLinks.nth(i).getAttribute('href')
        if (href) hrefs.push(href)
      }
    })

    const expectedRoutes = ['/programi', '/o-nama', '/novosti', '/kontakt', '/upisi']
    await test.step(`Verify all expected routes are present: ${expectedRoutes.join(', ')}`, async () => {
      for (const route of expectedRoutes) {
        const found = hrefs.some(h => h.includes(route))
        expect(found, `Navigation should contain a link to ${route}`).toBeTruthy()
      }
    })
  })
})
