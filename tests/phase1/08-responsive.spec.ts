import { test, expect } from '@playwright/test'
import { BASE, ALL_PAGES } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPONSIVE LAYOUT
// Tests every public page at mobile (375px) and tablet (768px) viewports.
// Checks for horizontal overflow (no scrollbar) and that the page renders
// content correctly at each breakpoint. Also verifies the nav collapses
// into a hamburger menu on mobile.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Responsive Layout — Mobile (375px) per-page overflow check', () => {
  for (const p of ALL_PAGES) {
    test(`${p.name} (${p.path}) — no horizontal overflow at 375px mobile width`, async ({ page }) => {
      await test.step('Set viewport to iPhone size (375x812)', async () => {
        await page.setViewportSize({ width: 375, height: 812 })
      })

      await test.step(`Navigate to ${p.path}`, async () => {
        await page.goto(`${BASE}${p.path}`)
      })

      await test.step('Measure body.scrollWidth and compare to viewport width (tolerance: 2px)', async () => {
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        const viewportWidth = await page.evaluate(() => window.innerWidth)
        expect(bodyWidth, `scrollWidth (${bodyWidth}) should not exceed viewport (${viewportWidth})`).toBeLessThanOrEqual(viewportWidth + 2)
      })
    })
  }
})

test.describe('Responsive Layout — Tablet (768px) per-page rendering check', () => {
  for (const p of ALL_PAGES) {
    test(`${p.name} (${p.path}) — renders without overflow at 768px tablet width`, async ({ page }) => {
      await test.step('Set viewport to iPad size (768x1024)', async () => {
        await page.setViewportSize({ width: 768, height: 1024 })
      })

      await test.step(`Navigate to ${p.path}`, async () => {
        await page.goto(`${BASE}${p.path}`)
      })

      await test.step('Measure body.scrollWidth and compare to viewport width (tolerance: 2px)', async () => {
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        const viewportWidth = await page.evaluate(() => window.innerWidth)
        expect(bodyWidth, `scrollWidth (${bodyWidth}) should not exceed viewport (${viewportWidth})`).toBeLessThanOrEqual(viewportWidth + 2)
      })

      await test.step('Verify the page has visible content (at least one heading or main content)', async () => {
        const content = page.locator('h1, h2, main, [role="main"]').first()
        await expect(content).toBeVisible({ timeout: 10000 })
      })
    })
  }
})

test.describe('Responsive Layout — Mobile navigation behavior', () => {
  test('Mobile (375px): Navigation collapses into a hamburger menu', async ({ page }) => {
    await test.step('Set viewport to iPhone size (375x812)', async () => {
      await page.setViewportSize({ width: 375, height: 812 })
    })

    await test.step('Navigate to homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Verify a hamburger menu button is visible (button with SVG icon or aria-label)', async () => {
      const hamburger = page.locator(
        'button[aria-label*="menu" i], button[aria-label*="nav" i], [data-testid="mobile-menu"], button:has(svg)'
      ).first()
      await expect(hamburger).toBeVisible()
    })
  })
})
