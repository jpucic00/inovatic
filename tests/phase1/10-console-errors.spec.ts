import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSOLE ERRORS
// Listens for JavaScript errors (console.error and uncaught exceptions)
// while navigating pages. Filters out benign issues (favicon 404,
// hydration warnings). Any remaining errors indicate real bugs.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Console Errors — No JavaScript errors on any public page', () => {
  test('Homepage produces zero console errors', async ({ page }) => {
    const errors: string[] = []

    await test.step('Attach console.error and pageerror listeners', async () => {
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', err => errors.push(err.message))
    })

    await test.step('Navigate to homepage and wait 2s for all scripts to execute', async () => {
      await page.goto(BASE)
      await page.waitForTimeout(2000)
    })

    await test.step('Filter out benign errors (favicon, 404, hydration) and assert none remain', async () => {
      const realErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('404') && !e.includes('hydration')
      )
      expect(realErrors, `JS errors: ${realErrors.join(', ')}`).toHaveLength(0)
    })
  })

  test('All public pages produce zero console errors', async ({ page }) => {
    const errorsByPage: Record<string, string[]> = {}
    const paths = ['/', '/programi', '/programi/slr-1', '/o-nama', '/novosti', '/upisi', '/kontakt', '/proslave']

    for (const path of paths) {
      await test.step(`Check ${path} for JavaScript errors`, async () => {
        const errors: string[] = []
        page.on('console', msg => {
          if (msg.type() === 'error') errors.push(msg.text())
        })
        page.on('pageerror', err => errors.push(err.message))

        await page.goto(`${BASE}${path}`)
        await page.waitForTimeout(1000)

        const realErrors = errors.filter(e =>
          !e.includes('favicon') && !e.includes('404') && !e.includes('hydration')
        )
        if (realErrors.length > 0) {
          errorsByPage[path] = realErrors
        }
      })
    }

    await test.step('Assert no pages produced JavaScript errors', async () => {
      const pagesWithErrors = Object.keys(errorsByPage)
      expect(pagesWithErrors, `Pages with errors: ${JSON.stringify(errorsByPage)}`).toHaveLength(0)
    })
  })
})
