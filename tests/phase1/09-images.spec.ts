import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMAGES
// Monitors network responses while loading pages to detect broken images
// (HTTP 4xx/5xx). Covers the homepage (logos, hero, course images) and
// the news listing (article cover images from Cloudinary).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Images — No broken images on public pages', () => {
  test('Homepage: All images load successfully (logos, hero, course images)', async ({ page }) => {
    const failedImages: string[] = []

    await test.step('Attach a network listener to capture failed image requests (HTTP >= 400)', async () => {
      page.on('response', (response) => {
        if (response.request().resourceType() === 'image' && response.status() >= 400) {
          failedImages.push(`${response.status()} ${response.url()}`)
        }
      })
    })

    await test.step('Navigate to homepage and wait 3s for all images to load', async () => {
      await page.goto(BASE)
      await page.waitForTimeout(3000)
    })

    await test.step('Assert no images returned HTTP errors', async () => {
      expect(failedImages, `Broken images: ${failedImages.join(', ')}`).toHaveLength(0)
    })
  })

  test('News listing: All article cover images load from Cloudinary', async ({ page }) => {
    const failedImages: string[] = []

    await test.step('Attach a network listener to capture failed image requests (HTTP >= 400)', async () => {
      page.on('response', (response) => {
        if (response.request().resourceType() === 'image' && response.status() >= 400) {
          failedImages.push(`${response.status()} ${response.url()}`)
        }
      })
    })

    await test.step('Navigate to /novosti and wait 3s for all cover images to load', async () => {
      await page.goto(`${BASE}/novosti`)
      await page.waitForTimeout(3000)
    })

    await test.step('Assert no images returned HTTP errors', async () => {
      expect(failedImages, `Broken images: ${failedImages.join(', ')}`).toHaveLength(0)
    })
  })
})
