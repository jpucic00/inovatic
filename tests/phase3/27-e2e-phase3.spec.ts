import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 16 — End-to-end integration
// One contiguous flow stitching together the Step 10–15 surfaces:
//   1. Admin seeds a teacher, assigns them to a standard-course group, and
//      creates a student in that group.
//   2. Teacher uploads a MODULE-scope LINK material and a GROUP-scope one.
//   3. Teacher marks attendance for a deterministic past date.
//   4. Teacher adds a MODULE_REVIEW on the student.
//   5. Admin opens the student page and sees both attendance + review for
//      the current school year.
//   6. Student logs in, lands on `/portal`, sees BOTH materials, and NO
//      attendance/comment/review text anywhere.
//   7. Teacher hides the MODULE material in this group; student loses it.
// Requires: dev server on localhost:3000, seeded admin, ≥1 standard-course group.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER = {
  firstName: 'Eva',
  lastName: `E2E${RUN_ID}`,
  email: `eva.e2e.${RUN_ID}@test.com`,
  phone: '0914440001',
}
const STUDENT = {
  firstName: 'Nora',
  lastName: `E2EKid${RUN_ID}`,
  dateOfBirth: '2016-04-04',
  childSchool: 'OŠ E2E',
  parentName: `Roditelj E2E ${RUN_ID}`,
  parentEmail: `e2e.kid.${RUN_ID}@test.com`,
  parentPhone: '0914445555',
}

const MODULE_MATERIAL = `E2E modul material ${RUN_ID}`
const GROUP_MATERIAL = `E2E grupa material ${RUN_ID}`
const REVIEW_TEXT = `E2E recenzija ${RUN_ID} — odličan napredak.`
const SESSION_DATE = '2026-03-10' // Tuesday, deterministic past date

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  studentLogin: { email: string; password: string }
  studentId: string
  groupId: string
}
let seeded: Seeded | null = null

// ─── Helpers (mirrored from specs 24–26) ─────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 30000 })
  await page.waitForLoadState('networkidle')
}

async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForLoadState('networkidle')
}

async function pickStandardGroupId(page: Page): Promise<string> {
  await page.goto(`${BASE}/admin/grupe`)
  const links = await page.locator('a[href^="/admin/grupe/"]').all()
  const ids: string[] = []
  for (const link of links) {
    const href = await link.getAttribute('href')
    const m = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
    if (m && !ids.includes(m[1])) ids.push(m[1])
  }
  if (ids.length === 0) throw new Error('no groups in /admin/grupe')

  for (const id of ids) {
    await page.goto(`${BASE}/admin/grupe/${id}`)
    const hasModules = await page.getByText('Polaznici po modulima').isVisible().catch(() => false)
    if (hasModules) return id
  }
  throw new Error('no standard-course group found')
}

async function createTeacher(page: Page): Promise<{ password: string; teacherId: string }> {
  await page.goto(`${BASE}/admin/nastavnici`)
  await page.getByRole('button', { name: 'Kreiraj nastavnika' }).click()
  await page.locator('#teacher-email').fill(TEACHER.email)
  await page.locator('#teacher-first').fill(TEACHER.firstName)
  await page.locator('#teacher-last').fill(TEACHER.lastName)
  await page.locator('#teacher-phone').fill(TEACHER.phone)
  await page.getByRole('button', { name: /^Kreiraj nastavnika$/ }).click()
  await expect(page.getByText('Pristupni podaci', { exact: true })).toBeVisible({ timeout: 15000 })

  const dialog = page.locator('[role="dialog"]')
  const passwordText = (await dialog.locator('p', { hasText: 'Lozinka:' }).innerText()).trim()
  const password = passwordText.replace(/^Lozinka:\s*/, '').trim()

  const profileLink = dialog.getByRole('link', { name: /Profil nastavnika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href')) ?? ''
  const m = href.match(/\/admin\/nastavnici\/([^/?#]+)/)
  if (!m) throw new Error('teacher id not found')
  const teacherId = m[1]
  await page.getByRole('button', { name: 'Zatvori' }).click()
  return { password, teacherId }
}

async function assignTeacherToGroup(page: Page, teacherId: string, groupId: string) {
  await page.goto(`${BASE}/admin/nastavnici/${teacherId}`)
  await page.getByRole('button', { name: /Dodijeli grupu/ }).click()
  await page.locator('#assign-group-select').selectOption(groupId)
  await page.getByRole('button', { name: /^Dodijeli$/ }).click()
  await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible({ timeout: 10000 })
}

async function createStudentInGroup(
  page: Page,
  groupId: string,
): Promise<{ studentId: string; username: string; password: string }> {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await page.locator('#create-student-first').fill(STUDENT.firstName)
  await page.locator('#create-student-last').fill(STUDENT.lastName)
  await page.locator('#create-student-dob').fill(STUDENT.dateOfBirth)
  await page.locator('#create-student-school').fill(STUDENT.childSchool)
  await page.locator('#create-student-parent-name').fill(STUDENT.parentName)
  await page.locator('#create-student-parent-email').fill(STUDENT.parentEmail)
  await page.locator('#create-student-parent-phone').fill(STUDENT.parentPhone)

  const dialog = page.locator('[role="dialog"]')
  const courseSelect = dialog.locator('select').first()
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    const radio = dialog.locator(`input[type="radio"][value="${groupId}"]`)
    await radio.first().waitFor({ state: 'attached', timeout: 1500 }).catch(() => null)
    if ((await radio.count()) > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not offered`)

  const all = dialog.locator('label', { hasText: 'Svi moduli' }).locator('input[type="checkbox"]')
  if (await all.isVisible().catch(() => false)) await all.check()

  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 15000 })

  const unameText = (await dialog.locator('p', { hasText: 'Korisničko ime:' }).innerText()).trim()
  const passText = (await dialog.locator('p', { hasText: 'Lozinka:' }).innerText()).trim()
  const username = unameText.replace(/^Korisničko ime:\s*/, '').trim()
  const password = passText.replace(/^Lozinka:\s*/, '').trim()

  const profileLink = dialog.getByRole('link', { name: /Profil učenika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href').catch(() => null)) ?? ''
  const m = href.match(/\/admin\/ucenici\/([^/?#]+)/)
  let studentId = m?.[1] ?? ''
  await page.keyboard.press('Escape')
  if (!studentId) {
    await page.goto(`${BASE}/admin/ucenici?q=${encodeURIComponent(STUDENT.lastName)}`)
    const row = page.locator(`a[href^="/admin/ucenici/"]`, { hasText: STUDENT.lastName }).first()
    const hrefBack = await row.getAttribute('href')
    const m2 = hrefBack?.match(/\/admin\/ucenici\/([^/?#]+)/)
    studentId = m2?.[1] ?? ''
  }
  if (!studentId) throw new Error('student id not found')
  return { studentId, username, password }
}

async function addLinkMaterial(page: Page, buttonLabelRegex: RegExp, title: string, url: string) {
  await page.getByRole('button', { name: buttonLabelRegex }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('#material-title').fill(title)
  await dialog.locator('label', { hasText: 'Poveznica' }).click()
  await dialog.locator('#material-external-url').fill(url)
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 16 — End-to-end', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const groupId = await pickStandardGroupId(page)
    const t = await createTeacher(page)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    const s = await createStudentInGroup(page, groupId)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      studentId: s.studentId,
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
      groupId,
    }
    await page.close()
  })

  test('teacher uploads MODULE + GROUP materials, marks attendance, writes review', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })

    // Materials
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)
    await addLinkMaterial(
      page,
      /Dodaj u modul:/,
      MODULE_MATERIAL,
      'https://example.com/e2e/module',
    )
    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      GROUP_MATERIAL,
      'https://example.com/e2e/group',
    )
    await expect(page.getByText(MODULE_MATERIAL)).toBeVisible()
    await expect(page.getByText(GROUP_MATERIAL)).toBeVisible()

    // Attendance for a deterministic past date
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)
    const dateInput = page.locator('input[type="date"]')
    await dateInput.waitFor({ state: 'visible', timeout: 20000 })
    // Dispatch a React-compatible input event after fill so the controlled
    // state updates even when headless Chromium is slow to hydrate large
    // pages (group pages here can have 70+ enrollment rows).
    await dateInput.fill(SESSION_DATE)
    await dateInput.evaluate((el) =>
      el.dispatchEvent(new Event('input', { bubbles: true })),
    )
    const addBtn = page.getByRole('button', { name: 'Dodaj' })
    await expect(addBtn).toBeEnabled({ timeout: 10000 })
    await addBtn.click()
    await page.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 15000 })

    // MODULE_REVIEW on the student detail page
    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)
    await page.waitForLoadState('networkidle')
    const textarea = page.getByPlaceholder('Dodaj bilješku o učeniku...')
    await textarea.waitFor({ state: 'visible', timeout: 30000 })
    await page.getByLabel('Ocjena modula').check()
    await textarea.fill(REVIEW_TEXT)
    const submit = page.getByRole('button', { name: /Dodaj bilješku/ })
    await expect(submit).toBeEnabled({ timeout: 5000 })
    await submit.click()
    await expect(page.getByText('Bilješka dodana.')).toBeVisible({ timeout: 15000 })
  })

  test('admin sees attendance + review on the student page for the current school year', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)

    // Attendance entry (Croatian short date for SESSION_DATE = 2026-03-10).
    await expect(page.getByRole('heading', { name: 'Evidencija dolaska' })).toBeVisible()
    await expect(page.getByText(/10\.\s?03\.\s?2026\./).first()).toBeVisible()
    await expect(page.getByText('Prisutan').first()).toBeVisible()

    // The review is rendered in the comments panel.
    await expect(page.getByText(REVIEW_TEXT)).toBeVisible()
    await expect(page.getByText(/20\d{2}\/20\d{2}/).first()).toBeVisible()
  })

  test('student lands on portal, sees materials, no attendance or review leaks', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    // Single-enrollment kid lands on materials directly.
    await expect(page.getByText(MODULE_MATERIAL)).toBeVisible()
    await expect(page.getByText(GROUP_MATERIAL)).toBeVisible()

    // Crawl portal routes and assert no comment/review/attendance text leaks.
    for (const path of ['/portal', `/portal/grupa/${seeded.groupId}`, '/portal/profil']) {
      await page.goto(`${BASE}${path}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain(REVIEW_TEXT.toLowerCase())
      expect(body).not.toContain('evidencija dolaska')
      expect(body).not.toContain('odsutan')
      expect(body).not.toContain('ocjena modula')
      expect(body).not.toContain('bilješke i recenzije')
    }
  })

  test('teacher hides MODULE material → student loses it (GROUP material stays)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const row = page.locator('li', { has: page.getByText(MODULE_MATERIAL) })
    await row.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
    await expect(row.getByText('Sakriveno u grupi')).toBeVisible({ timeout: 5000 })

    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(MODULE_MATERIAL)).toHaveCount(0)
    await expect(page.getByText(GROUP_MATERIAL)).toBeVisible()
  })
})
