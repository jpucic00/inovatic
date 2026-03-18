import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 404 HANDLING
// Verifies that navigating to a completely non-existent URL returns
// HTTP 404 instead of a server error or redirect.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('404 Handling — Non-existent routes return proper error', () => {
  test('Arbitrary non-existent path returns HTTP 404', async ({ page }) => {
    await test.step('Navigate to /non-existent-page-xyz (a route that does not exist)', async () => {
      const response = await page.goto(`${BASE}/non-existent-page-xyz`)
      expect(response?.status(), 'Non-existent route should return 404').toBe(404)
    })
  })
})
