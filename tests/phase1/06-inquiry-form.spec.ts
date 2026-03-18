import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INQUIRY FORM
// The /upisi page has a multi-step form (3 steps) where parents submit
// an inquiry about enrolling their child. Validates the form renders,
// has input fields, and shows validation errors on empty submission.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Inquiry Form — Multi-step enrollment inquiry at /upisi', () => {
  test('Step 1 of the form renders with visible <form> element', async ({ page }) => {
    await test.step('Navigate to /upisi', async () => {
      await page.goto(`${BASE}/upisi`)
    })

    await test.step('Verify a <form> element is visible on the page', async () => {
      const form = page.locator('form').first()
      await expect(form).toBeVisible({ timeout: 10000 })
    })
  })

  test('Step 1 contains input fields for parent information', async ({ page }) => {
    await test.step('Navigate to /upisi', async () => {
      await page.goto(`${BASE}/upisi`)
    })

    await test.step('Count all <input>, <select>, and <textarea> fields', async () => {
      const inputs = page.locator('input, select, textarea')
      const count = await inputs.count()
      expect(count, 'Step 1 should have at least 1 form input').toBeGreaterThan(0)
    })
  })

  test('Empty form submission triggers client-side validation errors', async ({ page }) => {
    await test.step('Navigate to /upisi', async () => {
      await page.goto(`${BASE}/upisi`)
    })

    await test.step('Click the submit/next button without filling any fields', async () => {
      const submitBtn = page.locator(
        'button[type="submit"], button:has-text("Dalje"), button:has-text("Nastavi"), button:has-text("Pošalji")'
      ).first()
      await expect(submitBtn).toBeVisible()
      await submitBtn.click()
    })

    await test.step('Verify validation error messages appear (role="alert" or .text-destructive)', async () => {
      await page.waitForTimeout(500)
      const errorMessages = page.locator('[role="alert"], .text-red, .text-destructive, [data-error], .error')
      const errorCount = await errorMessages.count()
      expect(errorCount, 'At least 1 validation error should be shown').toBeGreaterThan(0)
    })
  })
})
