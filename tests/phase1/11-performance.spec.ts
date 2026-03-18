import { test, expect } from '@playwright/test'
import { BASE, ALL_PAGES } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERFORMANCE
// Every public page should load (DOMContentLoaded) within 5 seconds and
// serve no single resource larger than 2 MB. Tests run per page to catch
// slow routes (e.g. heavy DB queries) or oversized assets.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Performance — Load time per page (DOMContentLoaded < 5s)', () => {
  for (const p of ALL_PAGES) {
    test(`${p.name} (${p.path}) — DOMContentLoaded under 5 seconds`, async ({ page }) => {
      let duration = 0

      await test.step(`Navigate to ${p.path} with waitUntil: "domcontentloaded" and measure time`, async () => {
        const start = Date.now()
        await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' })
        duration = Date.now() - start
      })

      await test.step(`Assert load time (${duration}ms) is under 5000ms`, async () => {
        expect(duration, `${p.path} DOMContentLoaded took ${duration}ms`).toBeLessThan(5000)
      })
    })
  }
})

test.describe('Performance — No oversized resources per page (< 2 MB each)', () => {
  for (const p of ALL_PAGES) {
    test(`${p.name} (${p.path}) — no resource exceeds 2 MB`, async ({ page }) => {
      const largeResources: string[] = []

      await test.step('Attach a network listener to flag resources larger than 2 MB', async () => {
        page.on('response', async (response) => {
          const headers = response.headers()
          const size = parseInt(headers['content-length'] || '0')
          if (size > 2 * 1024 * 1024) {
            largeResources.push(`${(size / 1024 / 1024).toFixed(1)}MB - ${response.url().substring(0, 100)}`)
          }
        })
      })

      await test.step(`Navigate to ${p.path} and wait 3s for all resources to load`, async () => {
        await page.goto(`${BASE}${p.path}`)
        await page.waitForTimeout(3000)
      })

      await test.step('Assert no resources exceeded the 2 MB threshold', async () => {
        expect(largeResources, `Large resources on ${p.path}: ${largeResources.join(', ')}`).toHaveLength(0)
      })
    })
  }
})
