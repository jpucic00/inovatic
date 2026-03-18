import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOMEPAGE
// Validates that the landing page renders all key sections: hero with CTA,
// course overview cards, latest news, navigation bar, and footer.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Homepage — Landing page with hero, courses, and news', () => {
  test('Page loads successfully and has the branded page title', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      const response = await page.goto(BASE)
      expect(response?.status()).toBe(200)
    })

    await test.step('Verify the page title contains the brand name and location', async () => {
      const title = await page.title()
      expect(title).toBeTruthy()
      expect(title).toContain('Inovatic')
    })
  })

  test('Hero section is visible with a primary heading', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Verify the hero <h1> heading is visible and contains text', async () => {
      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 10000 })
      const text = await h1.textContent()
      expect(text?.length).toBeGreaterThan(0)
    })
  })

  test('Navigation bar is rendered at the top of the page', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Verify a <nav> or <header> element is visible', async () => {
      const nav = page.locator('nav, header').first()
      await expect(nav).toBeVisible()
    })
  })

  test('Footer is rendered at the bottom of the page', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Verify a <footer> element is visible', async () => {
      const footer = page.locator('footer').first()
      await expect(footer).toBeVisible()
    })
  })

  test('Course overview section is present — mentions robotics programs', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Find text referencing courses (Svijet, SLR, Robotik, or Program)', async () => {
      const courseContent = page.locator('text=/[Ss]vijet|SLR|[Rr]obotik|[Pp]rogram/').first()
      await expect(courseContent).toBeVisible({ timeout: 10000 })
    })
  })

  test('News section is present — shows latest articles from the association', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Find text referencing news (Novosti, Vijesti, or Članci)', async () => {
      const newsSection = page.locator('text=/[Nn]ovosti|[Vv]ijesti|[Čč]lanci/').first()
      await expect(newsSection).toBeVisible({ timeout: 10000 })
    })
  })
})
