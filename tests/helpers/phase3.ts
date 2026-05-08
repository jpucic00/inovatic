import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

export const BASE = 'http://localhost:3000'
export const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
export const ADMIN_PASSWORD = 'admin123'

const STATE_FILE = path.resolve(__dirname, '../fixtures/phase3-state.json')

function readBootstrappedGroupIds(): string[] {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      'phase3-state.json not found — run 20-bootstrap.spec.ts first',
    )
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  return state.groupIds
}

export type TeacherData = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export type StudentData = {
  firstName: string
  lastName: string
  dateOfBirth: string
  childSchool: string
  parentName: string
  parentEmail: string
  parentPhone: string
}

export async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 30000 })
  await page.waitForLoadState('domcontentloaded')
}

export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForLoadState('domcontentloaded')
}

export function collectGroupIds(_page: Page, count: number): string[] {
  const ids = readBootstrappedGroupIds()
  if (ids.length < count) {
    throw new Error(`Need at least ${count} groups; found ${ids.length}`)
  }
  return ids.slice(0, count)
}

export function pickFirstGroupId(_page: Page): string {
  const ids = readBootstrappedGroupIds()
  if (ids.length === 0) throw new Error('no groups in phase3-state.json')
  return ids[0]
}

export const pickStandardGroupId = pickFirstGroupId

export async function getGroupCourseTitle(page: Page, groupId: string): Promise<string> {
  await page.goto(`${BASE}/admin/grupe/${groupId}`)
  const heading = (await page.locator('h1').first().innerText()).trim()
  return heading.split('–')[0].trim()
}

export async function createTeacher(
  page: Page,
  t: TeacherData,
): Promise<{ password: string; teacherId: string }> {
  await page.goto(`${BASE}/admin/nastavnici`)
  await page.getByRole('button', { name: 'Kreiraj nastavnika' }).click()
  await page.locator('#teacher-email').fill(t.email)
  await page.locator('#teacher-first').fill(t.firstName)
  await page.locator('#teacher-last').fill(t.lastName)
  await page.locator('#teacher-phone').fill(t.phone)
  await page.getByRole('button', { name: /^Kreiraj nastavnika$/ }).click()
  await expect(page.getByText('Pristupni podaci', { exact: true })).toBeVisible({ timeout: 15000 })

  const dialog = page.locator('[role="dialog"]')
  const passwordText = (await dialog.locator('p', { hasText: 'Lozinka:' }).innerText()).trim()
  const password = passwordText.replace(/^Lozinka:\s*/, '').trim()

  const profileLink = dialog.getByRole('link', { name: /Profil nastavnika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href')) ?? ''
  const m = href.match(/\/admin\/nastavnici\/([^/?#]+)/)
  if (!m) throw new Error(`Could not extract teacher ID from ${href}`)
  const teacherId = m[1]

  await page.getByRole('button', { name: 'Zatvori' }).click()
  return { password, teacherId }
}

export async function assignTeacherToGroup(page: Page, teacherId: string, groupId: string) {
  await page.goto(`${BASE}/admin/nastavnici/${teacherId}`)
  await page.getByRole('button', { name: /Dodijeli grupu/ }).click()
  const select = page.locator('#assign-group-select')
  await expect(select).toBeVisible()
  await select.selectOption(groupId)
  await page.getByRole('button', { name: /^Dodijeli$/ }).click()
  await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible({
    timeout: 10000,
  })
}

export async function createStudentInGroup(
  page: Page,
  groupId: string,
  student: StudentData,
): Promise<{ studentId: string; username: string; password: string }> {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await page.locator('#create-student-first').fill(student.firstName)
  await page.locator('#create-student-last').fill(student.lastName)
  await page.locator('#create-student-dob').fill(student.dateOfBirth)
  await page.locator('#create-student-school').fill(student.childSchool)
  await page.locator('#create-student-parent-name').fill(student.parentName)
  await page.locator('#create-student-parent-email').fill(student.parentEmail)
  await page.locator('#create-student-parent-phone').fill(student.parentPhone)

  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  const courseSelect = dialog.locator('select').first()
  await courseSelect.waitFor({ state: 'visible', timeout: 5000 })
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    const radio = dialog.locator(`input[type="radio"][value="${groupId}"]`)
    await radio
      .first()
      .waitFor({ state: 'attached', timeout: 3000 })
      .catch(() => null)
    if ((await radio.count()) > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in any course dropdown`)

  const allModulesLabel = dialog.locator('label', { hasText: 'Svi moduli' })
  if (await allModulesLabel.isVisible().catch(() => false)) {
    const cb = allModulesLabel.locator('input[type="checkbox"]')
    if (!(await cb.isChecked())) await allModulesLabel.click()
  }

  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 15000 })

  const unameText = (await dialog.locator('p', { hasText: 'Korisničko ime:' }).innerText()).trim()
  const passText = (await dialog.locator('p', { hasText: 'Lozinka:' }).innerText()).trim()
  const username = unameText.replace(/^Korisničko ime:\s*/, '').trim()
  const password = passText.replace(/^Lozinka:\s*/, '').trim()
  if (!username || !password) {
    throw new Error(`Could not parse credentials: ${unameText} / ${passText}`)
  }

  const profileLink = dialog.getByRole('link', { name: /Profil učenika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href').catch(() => null)) ?? ''
  const m = href.match(/\/admin\/ucenici\/([^/?#]+)/)
  let studentId = m?.[1] ?? ''
  await page.keyboard.press('Escape')

  if (!studentId) {
    await page.goto(`${BASE}/admin/ucenici?q=${encodeURIComponent(student.lastName)}`)
    const row = page.locator(`a[href^="/admin/ucenici/"]`, { hasText: student.lastName }).first()
    const hrefBack = await row.getAttribute('href')
    const m2 = hrefBack?.match(/\/admin\/ucenici\/([^/?#]+)/)
    studentId = m2?.[1] ?? ''
  }
  if (!studentId) throw new Error('student id not found after creation')
  return { studentId, username, password }
}

export async function createStudentNoEnrollment(
  page: Page,
  student: StudentData,
): Promise<{ username: string; password: string }> {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()

  await page.locator('#create-student-first').fill(student.firstName)
  await page.locator('#create-student-last').fill(student.lastName)
  await page.locator('#create-student-dob').fill(student.dateOfBirth)
  await page.locator('#create-student-school').fill(student.childSchool)
  await page.locator('#create-student-parent-name').fill(student.parentName)
  await page.locator('#create-student-parent-email').fill(student.parentEmail)
  await page.locator('#create-student-parent-phone').fill(student.parentPhone)

  const dialog = page.locator('[role="dialog"]')
  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 10000 })

  const usernameText = (await dialog.locator('p', { hasText: 'Korisničko ime:' }).innerText()).trim()
  const passwordText = (await dialog.locator('p', { hasText: 'Lozinka:' }).innerText()).trim()
  const username = usernameText.replace(/^Korisničko ime:\s*/, '').trim()
  const password = passwordText.replace(/^Lozinka:\s*/, '').trim()
  if (!username || !password) {
    throw new Error(`Could not parse credentials: ${usernameText} / ${passwordText}`)
  }
  return { username, password }
}

export async function addLinkMaterial(
  page: Page,
  buttonLabelRegex: RegExp,
  title: string,
  url: string,
) {
  await page.getByRole('button', { name: buttonLabelRegex }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('#material-title').fill(title)
  await dialog.locator('label', { hasText: 'Poveznica' }).click()
  await dialog.locator('#material-external-url').fill(url)
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 })
}

export async function markSession(page: Page, groupId: string, date: string) {
  await page.goto(`${BASE}/nastavnik/grupa/${groupId}/dolazak`)
  const dateInput = page.locator('input[type="date"]')
  await dateInput.waitFor({ state: 'visible', timeout: 20000 })
  await dateInput.fill(date)
  await dateInput.evaluate((el) => el.dispatchEvent(new Event('input', { bubbles: true })))
  const addBtn = page.getByRole('button', { name: 'Dodaj' })
  await expect(addBtn).toBeEnabled({ timeout: 10000 })
  await addBtn.click()
  await page.getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 15000 })
}

export async function addEnrollmentToStudent(
  page: Page,
  studentId: string,
  groupId: string,
) {
  await page.goto(`${BASE}/admin/ucenici/${studentId}`)
  await page.getByRole('button', { name: 'Upiši u novu grupu' }).click()

  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  const courseSelect = dialog.locator('#add-enrollment-course')
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    const radio = dialog.locator(`input[name="add-enrollment-group"][value="${groupId}"]`)
    await radio
      .first()
      .waitFor({ state: 'attached', timeout: 2000 })
      .catch(() => null)
    if ((await radio.count()) > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in add-enrollment dialog`)

  const allModulesLabel2 = dialog.locator('label', { hasText: 'Svi moduli' })
  if (await allModulesLabel2.isVisible().catch(() => false)) {
    const cb = allModulesLabel2.locator('input[type="checkbox"]')
    if (!(await cb.isChecked())) await allModulesLabel2.click()
  }

  await dialog.getByRole('button', { name: 'Upiši' }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

export async function expectNotFoundPage(page: Page) {
  await page.waitForLoadState('networkidle')
  const body = (await page.locator('body').innerText()).toLowerCase()
  const hasNotFound =
    body.includes('not found') ||
    body.includes('404') ||
    body.includes('stranica nije pronađena')
  expect(hasNotFound, `Expected a not-found page but got: "${body.slice(0, 200)}"`).toBe(true)
}
