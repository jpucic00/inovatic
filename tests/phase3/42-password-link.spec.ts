import { test, expect } from '@playwright/test'
import { db } from '@/lib/db'
import { issuePasswordToken } from '@/lib/password-token'
import { BASE, collectGroupIds, loginWithEmail, openLoginForm, type StudentData } from '../helpers/phase3'
import { seedStudentInGroup } from '../helpers/seed'
import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'

/**
 * The family journey since 2026-09-29, end to end in a real browser: a parent
 * gets a one-time link, chooses a password on /postavi-lozinku, signs in with
 * their e-mail, and — with two children — picks one in /portal/odabir.
 */

const RUN_ID = newRunId()

test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

const child = (firstName: string): StudentData => ({
  firstName,
  lastName: `Lozinkic${RUN_ID}`,
  dateOfBirth: firstName === 'Ana' ? '2016-03-03' : '2018-05-05',
  childSchool: 'OŠ Meje',
  parentName: `Ivana Lozinkic ${RUN_ID}`,
  parentEmail: `ivana.lozinkic.${RUN_ID}@test.com`,
  parentPhone: '0915555555',
})

const NEW_PASSWORD = 'konj jede zeleni kupus'

let parentEmail = ''
let parentId = ''

test.describe.configure({ mode: 'serial' })

test.describe('password link → setup → login → child picker', () => {
  test.beforeAll(async () => {
    const [groupId] = collectGroupIds(1)
    // Two children on ONE parent login: seed the first, then put the second on
    // the same account.
    const ana = await seedStudentInGroup(groupId, child('Ana'))
    const marko = await seedStudentInGroup(groupId, child('Marko'))
    const anaRow = await db.user.findUniqueOrThrow({
      where: { id: ana.studentId },
      select: { parentAccountId: true },
    })
    parentId = anaRow.parentAccountId as string
    parentEmail = ana.loginEmail
    const markoRow = await db.user.findUniqueOrThrow({
      where: { id: marko.studentId },
      select: { parentAccountId: true },
    })
    await db.user.update({
      where: { id: marko.studentId },
      data: { parentAccountId: parentId, parentEmail },
    })
    await db.user.delete({ where: { id: markoRow.parentAccountId as string } })
  })

  test('the link sets a password, is spent, and the family signs in with it', async ({ page }) => {
    const { token } = await issuePasswordToken({ userId: parentId, purpose: 'SETUP', createdById: null })

    await page.goto(`${BASE}/postavi-lozinku#${token}`)
    await expect(page.getByText(parentEmail).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Ana Lozinkic/)).toBeVisible()
    // The token leaves the address bar as soon as the page has read it.
    await expect.poll(() => new URL(page.url()).hash).toBe('')

    await page.locator('#new-password').fill(NEW_PASSWORD)
    await page.locator('#confirm-password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Postavi lozinku' }).click()
    await expect(page.getByText('Lozinka je postavljena.', { exact: false })).toBeVisible({
      timeout: 15000,
    })

    // Spent: the same link now says so instead of offering the form again.
    await page.goto(`${BASE}/postavi-lozinku#${token}`)
    await expect(page.getByText(/već iskorištena/)).toBeVisible({ timeout: 15000 })

    // Two children → the picker, then the chosen child's portal.
    await loginWithEmail(page, parentEmail, NEW_PASSWORD)
    await page.waitForURL(/\/portal\/odabir/, { timeout: 30000 })
    await page.getByRole('button', { name: new RegExp(`Marko Lozinkic${RUN_ID}`) }).click()
    await page.waitForURL(/\/portal\/grupa\//, { timeout: 30000 })
    await expect(page.locator('header').getByText(new RegExp(`Marko Lozinkic${RUN_ID}`))).toBeVisible()
  })

  test('the old child login no longer exists — a username is refused', async ({ page }) => {
    const anyChild = await db.user.findFirstOrThrow({
      where: { role: 'STUDENT', lastName: `Lozinkic${RUN_ID}` },
      select: { username: true },
    })
    await openLoginForm(page)
    await page.locator('#identifier').fill(anyChild.username ?? '')
    await page.locator('input[type="password"]').fill(NEW_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(/Pogrešan e-mail ili lozinka/)).toBeVisible({ timeout: 15000 })
  })
})
