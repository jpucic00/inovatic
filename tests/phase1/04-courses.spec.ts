import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COURSE DETAIL PAGES
// Each of the 4 SLR course levels has a dedicated detail page. Validates
// that each shows the correct course title, age range information, and
// that invalid course slugs return 404.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Course Detail Pages — Content and 404 handling', () => {
  const courses = [
    { slug: 'slr-1', title: 'Svijet LEGO Robotike 1' },
    { slug: 'slr-2', title: 'Svijet LEGO Robotike 2' },
    { slug: 'slr-3', title: 'Svijet LEGO Robotike 3' },
    { slug: 'slr-4', title: 'Svijet LEGO Robotike 4' },
  ]

  for (const course of courses) {
    test(`${course.slug} — Shows course title and age range`, async ({ page }) => {
      await test.step(`Navigate to /programi/${course.slug}`, async () => {
        await page.goto(`${BASE}/programi/${course.slug}`)
      })

      await test.step(`Verify the <h1> heading displays "${course.title}"`, async () => {
        const h1 = page.locator('h1').first()
        await expect(h1).toBeVisible({ timeout: 10000 })
        const text = await h1.textContent()
        expect(text).toContain(course.title)
      })

      await test.step('Verify age range information is shown (text containing "godina")', async () => {
        const ageText = page.locator('text=/godina|god\\./').first()
        await expect(ageText).toBeVisible()
      })
    })
  }

  test('Non-existent course slug returns HTTP 404', async ({ page }) => {
    await test.step('Navigate to /programi/non-existent-course', async () => {
      const response = await page.goto(`${BASE}/programi/non-existent-course`)
      expect(response?.status()).toBe(404)
    })
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROGRAMS LISTING
// The /programi page should display all 4 course levels (SLR 1–4) with
// clickable links to each course detail page.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Programs Listing — Overview of all 4 SLR levels', () => {
  test('All 4 course levels (1–4) are displayed on the page', async ({ page }) => {
    await test.step('Navigate to /programi', async () => {
      await page.goto(`${BASE}/programi`)
    })

    for (const level of ['1', '2', '3', '4']) {
      await test.step(`Verify level ${level} is mentioned on the page`, async () => {
        const levelText = page.locator(`text=/SLR.*${level}|Razina.*${level}|Svijet.*${level}/`).first()
        await expect(levelText).toBeVisible()
      })
    }
  })

  test('Each course has a clickable link to its detail page (/programi/slr-*)', async ({ page }) => {
    await test.step('Navigate to /programi', async () => {
      await page.goto(`${BASE}/programi`)
    })

    await test.step('Count links matching /programi/slr-* and verify at least 4 exist', async () => {
      const courseLinks = page.locator('a[href*="/programi/slr-"]')
      const count = await courseLinks.count()
      expect(count, 'Should have at least 4 course links (one per SLR level)').toBeGreaterThanOrEqual(4)
    })
  })
})
