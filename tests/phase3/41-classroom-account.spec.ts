/**
 * Račun za učionicu (2026-09-20): the one permanent shared login per city.
 *
 * A teacher reads it on /nastavnik, types it on the classroom PCs, picks a
 * program and then a group, and the children reach that group's materials —
 * and only the materials. Gallery, evaluation and profile stay behind the
 * child's own account.
 */
import { test, expect } from '@playwright/test'
import {
  BASE,
  collectGroupIds,
  createTeacher,
  loginAsAdmin,
  loginWithEmail,
  getGroupCourseTitle,
  gotoPortalPath,
} from '../helpers/phase3'
import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'

const RUN_ID = newRunId()

test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

const TEACHER = {
  firstName: 'Ucionica',
  lastName: `Nastavnik${RUN_ID}`,
  email: `ucionica.nastavnik.${RUN_ID}@test.com`,
  phone: '0915555555',
}

let teacherPassword = ''
let classroom: { username: string; password: string } | null = null
let groupId = ''
let courseTitle = ''

test.describe.configure({ mode: 'serial' })

test.describe('Račun za učionicu', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const t = await createTeacher(page, TEACHER)
    teacherPassword = t.password
    ;[groupId] = collectGroupIds(page, 1)
    courseTitle = await getGroupCourseTitle(page, groupId)
    await page.close()
  })

  test('a teacher reads the classroom login on /nastavnik', async ({ page }) => {
    await loginWithEmail(page, TEACHER.email, teacherPassword)
    await page.goto(`${BASE}/nastavnik`)
    await expect(page.getByRole('heading', { name: 'Račun za učionicu' })).toBeVisible()
    const username = (await page.getByTestId('classroom-username').innerText()).trim()
    const password = (await page.getByTestId('classroom-password').innerText()).trim()
    expect(username).toBe('ucionica-split')
    expect(password).toMatch(/^\S{6,}$/)
    classroom = { username, password }
  })

  test('the classroom login picks a program, then a group, then sees materials only', async ({ page }) => {
    test.skip(!classroom, 'credentials not read')
    await loginWithEmail(page, classroom!.username, classroom!.password)

    // Step one: programs of this city, this school year.
    await expect(page.getByRole('heading', { name: 'Odaberite program' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Račun za učionicu · Split')).toBeVisible()
    // No profile for a shared login.
    await expect(page.getByRole('link', { name: 'Profil' })).toHaveCount(0)

    await page.getByRole('link', { name: new RegExp(courseTitle) }).first().click()
    await expect(page).toHaveURL(/\/portal\/program\//)
    await expect(page.getByRole('heading', { name: courseTitle, exact: true })).toBeVisible()

    // Step two: a group of that program.
    await page.locator('a[href^="/portal/grupa/"]').first().click()
    await expect(page).toHaveURL(/\/portal\/grupa\//)
    await expect(page.getByRole('link', { name: 'Natrag na grupe' })).toBeVisible()
    // The tab strip a child gets is absent: no Galerija, no Evaluacija.
    await expect(page.getByRole('link', { name: 'Galerija' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Evaluacija' })).toHaveCount(0)
  })

  test('gallery, evaluation and profile by URL bounce back to the program list', async ({ page }) => {
    test.skip(!classroom, 'credentials not read')
    await loginWithEmail(page, classroom!.username, classroom!.password)
    for (const path of [`/portal/grupa/${groupId}/galerija`, `/portal/grupa/${groupId}/evaluacija`, '/portal/profil']) {
      await gotoPortalPath(page, path)
      await expect(page).toHaveURL(`${BASE}/portal`)
      await expect(page.getByRole('heading', { name: 'Odaberite program' })).toBeVisible()
    }
  })
})
