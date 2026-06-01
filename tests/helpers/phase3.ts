// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 test helpers — UI-driven seeders.
//
// IMPORTANT: `createTeacher`, `createStudentInGroup`, `createStudentNoEnrollment`,
// and `assignTeacherToGroup` exercise the admin "Kreiraj učenika" / "Kreiraj
// nastavnika" dialogs end-to-end (clicks, form fills, password capture).
// Per Flux lu3f9sh, these UI helpers should ONLY be used by:
//   - tests/phase2/17-students.spec.ts
//   - tests/phase2/19-teachers.spec.ts
// as deliberate dialog-regression guards. Every other Phase 3 spec switches
// to direct-Prisma seeding via `tests/helpers/seed.ts` (~25-50s saved per
// fixture).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { v2 as cloudinarySdk } from 'cloudinary'
import { submitUntilUrl } from './hydration'

export const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
const ADMIN_PASSWORD = 'admin123'

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
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
  await page.waitForLoadState('domcontentloaded')
}

export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), /\/(admin|nastavnik|portal)/)
  await page.waitForLoadState('domcontentloaded')
}

// Both `collectGroupIds` and `pickStandardGroupId` just read from
// tests/fixtures/phase3-state.json — they don't actually need a Page. The
// optional `_page` parameter is kept so existing call sites still type-check
// without churn; seed.ts-only specs can omit it entirely.
export function collectGroupIds(countOrPage: number | Page, maybeCount?: number): string[] {
  const count = typeof countOrPage === 'number' ? countOrPage : maybeCount!
  const ids = readBootstrappedGroupIds()
  if (ids.length < count) {
    throw new Error(`Need at least ${count} groups; found ${ids.length}`)
  }
  return ids.slice(0, count)
}

export function pickStandardGroupId(_page?: Page): string {
  const ids = readBootstrappedGroupIds()
  if (ids.length === 0) throw new Error('no groups in phase3-state.json')
  return ids[0]
}

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

/**
 * Reads username + plainPassword off the admin student detail page's
 * "Pristupni podaci" card. The create dialogs no longer surface credentials in
 * a result modal, so callers navigate to /admin/ucenici/[id] and read them here.
 * Assumes the page is already on the student detail route.
 */
async function readCredentialsFromDetail(
  page: Page,
): Promise<{ username: string; password: string }> {
  const username = (
    await page
      .locator('xpath=//dt[normalize-space()="Korisničko ime"]/following-sibling::dd')
      .first()
      .innerText()
  ).trim()
  const password = (
    await page
      .locator('xpath=//dt[normalize-space()="Lozinka"]/following-sibling::dd')
      .first()
      .innerText()
  ).trim()
  return { username, password }
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
  // The result modal was dropped: on success the dialog closes (setOpen(false))
  // and a toast fires. Locate the new student and read credentials off the
  // detail page's "Pristupni podaci" card.
  await expect(dialog).toBeHidden({ timeout: 15000 })

  await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(student.lastName)}`)
  const row = page.locator('a[href^="/admin/ucenici/"]', { hasText: student.lastName }).first()
  const href = (await row.getAttribute('href')) ?? ''
  const studentId = href.match(/\/admin\/ucenici\/([^/?#]+)/)?.[1] ?? ''
  if (!studentId) throw new Error('student id not found after creation')
  await row.click()
  await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

  const { username, password } = await readCredentialsFromDetail(page)
  if (!username || !password) {
    throw new Error(`Could not read credentials for ${student.lastName}`)
  }
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
  // Result modal dropped — dialog closes on success; read credentials off the
  // student detail page instead.
  await expect(dialog).toBeHidden({ timeout: 10000 })

  await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(student.lastName)}`)
  const row = page.locator('a[href^="/admin/ucenici/"]', { hasText: student.lastName }).first()
  await row.click()
  await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

  const { username, password } = await readCredentialsFromDetail(page)
  if (!username || !password) {
    throw new Error(`Could not read credentials for ${student.lastName}`)
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

let cloudinaryConfigured = false
function configureCloudinaryOnce() {
  if (cloudinaryConfigured) return
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const key = process.env.CLOUDINARY_API_KEY
  const secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) {
    throw new Error('cloudinaryAssetStatus: CLOUDINARY_* env vars missing')
  }
  cloudinarySdk.config({ cloud_name: cloud, api_key: key, api_secret: secret })
  cloudinaryConfigured = true
}

/**
 * Hit Cloudinary's Admin API (NOT the CDN) to check whether an uploaded
 * asset still exists. Used as a deterministic alternative to polling the
 * CDN — the Admin API queries Cloudinary's metadata DB, so a destroy()
 * reflects ~1-3s after the fire-and-forget cleanup kicks off in
 * src/actions/material/crud.ts:160 with no CDN propagation delay.
 *
 * Returns the HTTP status: 200 if the asset exists, 404 if destroyed.
 * Throws if Cloudinary creds aren't configured — call sites should check
 * env presence and test.skip() rather than fail noisily.
 *
 * Uses the cloudinary SDK rather than a hand-rolled fetch so we don't have
 * to wrangle URL encoding for publicIds that contain folder slashes.
 */
export async function cloudinaryAssetStatus(
  publicId: string,
  resourceType: 'image' | 'raw' | 'video',
): Promise<number> {
  configureCloudinaryOnce()
  try {
    await cloudinarySdk.api.resource(publicId, { resource_type: resourceType })
    return 200
  } catch (err: unknown) {
    const httpCode =
      (err as { error?: { http_code?: number } }).error?.http_code ??
      (err as { http_code?: number }).http_code
    if (httpCode === 404) return 404
    throw err
  }
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
  // Wait for React to commit setSelected(date) before clicking Spremi —
  // otherwise handleSave can read the previous `selected` and persist the
  // attendance against the wrong date. The right-column <h3> in
  // attendance-marker.tsx renders the active session in Croatian format.
  await expect(
    page.getByRole('heading', { level: 3, name: croatianDateRegex(date) }),
  ).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 15000 })
}

/** Match Croatian `dd.MM.yyyy.` / `dd. MM. yyyy.` rendering of an ISO date. */
export function croatianDateRegex(isoDate: string): RegExp {
  const [yyyy, mm, dd] = isoDate.split('-')
  return new RegExp(`${dd}\\.\\s?${mm}\\.\\s?${yyyy}\\.`)
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
