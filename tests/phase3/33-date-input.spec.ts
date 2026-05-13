import { test, expect, type Page } from '@playwright/test'
import { BASE, loginAsAdmin } from '../helpers/phase3'

test.describe.configure({ mode: 'serial' })

async function openCreateGroupDialog(page: Page) {
  await page.goto(`${BASE}/admin/grupe`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Nova grupa' }).click()
  // create-enrollmentStart is always present; create-enrollmentStart only renders for radionice
  await expect(page.locator('input#create-enrollmentStart')).toBeVisible({ timeout: 10000 })
}

async function pasteIntoDateField(page: Page, fieldId: string, text: string) {
  await page.evaluate(
    ([id, value]) => {
      const el = document.getElementById(id) as HTMLInputElement
      const dt = new DataTransfer()
      dt.setData('text/plain', value)
      el.focus()
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    },
    [fieldId, text],
  )
}

test.describe('DateInput dd.MM.yyyy parsing', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    await page.close()
  })

  test('T1: auto-dot — typing 15052026 inserts dots', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await openCreateGroupDialog(page)
    const dateField = page.locator('input#create-enrollmentStart')
    await dateField.pressSequentially('15052026')
    await expect(dateField).toHaveValue('15.05.2026')
  })

  test('T2: paste ISO 2026-05-15 normalises to Croatian display', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await openCreateGroupDialog(page)
    await pasteIntoDateField(page, 'create-enrollmentStart', '2026-05-15')
    await expect(page.locator('input#create-enrollmentStart')).toHaveValue('15.05.2026')
  })

  test('T3: paste Croatian 15.05.2026 round-trips unchanged', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await openCreateGroupDialog(page)
    await pasteIntoDateField(page, 'create-enrollmentStart', '15.05.2026')
    await expect(page.locator('input#create-enrollmentStart')).toHaveValue('15.05.2026')
  })

  test('T4: invalid date 32.13.2026 is cleared on blur', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await openCreateGroupDialog(page)
    const dateField = page.locator('input#create-enrollmentStart')
    await dateField.pressSequentially('32.13.2026')
    await dateField.blur()
    await expect(dateField).toHaveValue('')
  })
})
