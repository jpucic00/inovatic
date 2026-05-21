import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOMEPAGE
// Validates that the landing page renders all key sections: hero with CTA,
// course overview cards, latest news, navigation bar, and footer.
// All 6 original section assertions are preserved via test.step() blocks on a
// single shared goto() so failures still pinpoint which selector broke
// without paying the page-load cost six times.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('homepage renders all key sections', async ({ page }) => {
  await test.step('Navigate to the homepage and confirm 200', async () => {
    const response = await page.goto(BASE)
    expect(response?.status(), 'homepage GET / returns 200').toBe(200)
  })

  await test.step('Branded page title contains "Inovatic"', async () => {
    const title = await page.title()
    expect(title, 'page <title> is non-empty').toBeTruthy()
    expect(title, 'page <title> mentions the brand').toContain('Inovatic')
  })

  await test.step('Hero <h1> is visible with non-empty text', async () => {
    const h1 = page.locator('h1').first()
    await expect(h1, 'hero <h1> is visible').toBeVisible({ timeout: 10000 })
    const text = await h1.textContent()
    expect(text?.length, 'hero <h1> has non-empty text').toBeGreaterThan(0)
  })

  await test.step('Navigation bar (<nav> or <header>) is visible at the top', async () => {
    const nav = page.locator('nav, header').first()
    await expect(nav, 'top-level navigation is visible').toBeVisible()
  })

  await test.step('Footer is visible at the bottom', async () => {
    const footer = page.locator('footer').first()
    await expect(footer, 'page <footer> is visible').toBeVisible()
  })

  await test.step('Course overview section mentions robotics programs', async () => {
    const courseContent = page
      .locator('text=/[Ss]vijet|SLR|[Rr]obotik|[Pp]rogram/')
      .first()
    await expect(courseContent, 'course overview text is rendered').toBeVisible({
      timeout: 10000,
    })
  })

  await test.step('News section mentions Novosti / Vijesti / Članci', async () => {
    const newsSection = page.locator('text=/[Nn]ovosti|[Vv]ijesti|[Čč]lanci/').first()
    await expect(newsSection, 'news/articles section is rendered').toBeVisible({
      timeout: 10000,
    })
  })
})
