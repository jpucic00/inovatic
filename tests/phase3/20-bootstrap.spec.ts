import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { BASE, loginAsAdmin } from '../helpers/phase3'

const STATE_FILE = path.resolve(__dirname, '../fixtures/phase3-state.json')

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 0 — Bootstrap (creates groups for downstream specs)', () => {
  test('admin can login after db seed', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(`${BASE}/admin`)
  })

  test('admin visits /admin/programi to seed ModuleSchedules for current year', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/programi`)
    await expect(page.getByText(/Svijet LEGO Robotike/).first()).toBeVisible({ timeout: 10000 })
  })

  test('admin creates two standard-course ScheduledGroups via the UI', async ({ page }) => {
    test.setTimeout(120000)
    await loginAsAdmin(page)

    const groupIds: string[] = []

    for (let i = 0; i < 2; i++) {
      await page.goto(`${BASE}/admin/grupe`)
      await page.getByRole('button', { name: 'Nova grupa' }).click()

      const dialog = page.locator('[role="dialog"]')
      await dialog.waitFor({ state: 'visible', timeout: 10000 })

      await dialog.locator('#create-courseId').selectOption({ index: 1 })
      await dialog.locator('#create-locationId').selectOption({ index: 1 })
      await dialog.locator('#create-name').fill(`Test Grupa ${String.fromCharCode(65 + i)}`)
      await dialog.locator('#create-dayOfWeek').selectOption(i === 0 ? 'Ponedjeljak' : 'Utorak')
      await dialog.locator('#create-startTime').fill('17:00')
      await dialog.locator('#create-endTime').fill('18:30')

      // Signup window moved to the program (per school year); phase-3 flows
      // don't need the public form, so no window is set here.
      await dialog.getByRole('button', { name: 'Kreiraj grupu' }).click()
      await expect(page.getByText('Grupa kreirana.')).toBeVisible({ timeout: 15000 })
    }

    await page.goto(`${BASE}/admin/grupe`)
    const links = await page.locator('a[href^="/admin/grupe/"]').all()
    for (const link of links) {
      const href = await link.getAttribute('href')
      const m = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
      if (m && !groupIds.includes(m[1])) groupIds.push(m[1])
    }

    expect(groupIds.length).toBeGreaterThanOrEqual(2)

    fs.writeFileSync(STATE_FILE, JSON.stringify({ groupIds }, null, 2))
  })

  test('created groups appear on the admin groups page with correct details', async ({ page }) => {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    expect(state.groupIds.length).toBeGreaterThanOrEqual(2)

    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/grupe`)
    await expect(page.getByRole('link', { name: 'Test Grupa A' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Test Grupa B' }).first()).toBeVisible()
  })
})
