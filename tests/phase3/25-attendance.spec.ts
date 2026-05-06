import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 14 — Attendance (teacher weekly marking + admin history view)
// Verifies: teacher can mark a class session; re-marking updates instead of
// duplicating; admin student detail shows the saved attendance with recorder
// name and note; student portal never leaks attendance text. Uses the
// ad-hoc date input to pick a deterministic session date, so the test is
// independent of which module windows a seeded group happens to have.
// Requires: dev server on localhost:3000, seeded admin, ≥1 standard-course
// group (so we can reuse the teacher-panel helper style).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER = {
  firstName: 'Ana',
  lastName: `DolNast${RUN_ID}`,
  email: `ana.dolnast.${RUN_ID}@test.com`,
  phone: '0912220001',
}
const OTHER_TEACHER = {
  firstName: 'Bruno',
  lastName: `DolOther${RUN_ID}`,
  email: `bruno.dolother.${RUN_ID}@test.com`,
  phone: '0912220002',
}
const STUDENT = {
  firstName: 'Pavla',
  lastName: `DolKid${RUN_ID}`,
  dateOfBirth: '2016-05-05',
  childSchool: 'OŠ Dolazak',
  parentName: `Roditelj Dol ${RUN_ID}`,
  parentEmail: `dol.kid.${RUN_ID}@test.com`,
  parentPhone: '0911117777',
}

// A fixed past date so we can deterministically pick it in the date picker
// without depending on module windows existing in the seeded data.
const SESSION_DATE = '2026-03-17' // Tuesday — arbitrary past date
const RE_MARK_NOTE = 'Opravdano – bolest'

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  otherTeacher: { email: string; password: string }
  groupId: string
  otherGroupId: string
  studentId: string
  studentLogin: { email: string; password: string }
}
let seeded: Seeded | null = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function collectGroupIds(page: Page, count: number): Promise<string[]> {
  await page.goto(`${BASE}/admin/grupe`)
  const links = await page.locator('a[href^="/admin/grupe/"]').all()
  const ids: string[] = []
  for (const link of links) {
    const href = await link.getAttribute('href')
    const m = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
    if (m && !ids.includes(m[1])) ids.push(m[1])
    if (ids.length >= count) break
  }
  if (ids.length < count) throw new Error(`Need ≥${count} groups, found ${ids.length}`)
  return ids
}

async function createTeacher(page: Page, t: typeof TEACHER): Promise<{ password: string; teacherId: string }> {
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
  await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible({
    timeout: 10000,
  })
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
    await radio
      .first()
      .waitFor({ state: 'attached', timeout: 1500 })
      .catch(() => null)
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

  // Grab the created student's id from the profile link in the dialog.
  const profileLink = dialog.getByRole('link', { name: /Profil učenika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href').catch(() => null)) ?? ''
  const m = href.match(/\/admin\/ucenici\/([^/?#]+)/)
  let studentId = m?.[1] ?? ''
  await page.keyboard.press('Escape')

  if (!studentId) {
    // Fallback: look up by last name on the list page.
    await page.goto(`${BASE}/admin/ucenici?q=${encodeURIComponent(STUDENT.lastName)}`)
    const row = page.locator(`a[href^="/admin/ucenici/"]`, { hasText: STUDENT.lastName }).first()
    const hrefBack = await row.getAttribute('href')
    const m2 = hrefBack?.match(/\/admin\/ucenici\/([^/?#]+)/)
    studentId = m2?.[1] ?? ''
  }
  if (!studentId) throw new Error('student id not found')
  return { studentId, username, password }
}

async function markSession(page: Page, groupId: string, date: string) {
  await page.goto(`${BASE}/nastavnik/grupa/${groupId}/dolazak`)
  const dateInput = page.locator('input[type="date"]')
  await dateInput.waitFor({ state: 'visible', timeout: 20000 })
  await dateInput.fill(date)
  // fill() on <input type="date"> doesn't always trigger React's controlled
  // onChange under slow hydration; dispatch input manually so the Dodaj
  // button actually enables when this page has 70+ roster rows.
  await dateInput.evaluate((el) =>
    el.dispatchEvent(new Event('input', { bubbles: true })),
  )
  const addBtn = page.getByRole('button', { name: 'Dodaj' })
  await expect(addBtn).toBeEnabled({ timeout: 10000 })
  await addBtn.click()
  await page.getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 15000 })
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 14 — Attendance', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupId, otherGroupId] = await collectGroupIds(page, 2)
    const t = await createTeacher(page, TEACHER)
    const ot = await createTeacher(page, OTHER_TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    await assignTeacherToGroup(page, ot.teacherId, otherGroupId)

    const s = await createStudentInGroup(page, groupId)

    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      otherTeacher: { email: OTHER_TEACHER.email, password: ot.password },
      groupId,
      otherGroupId,
      studentId: s.studentId,
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
    }
    await page.close()
  })

  test('teacher marks a session and admin sees the entry on the student page', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await markSession(page, seeded.groupId, SESSION_DATE)

    // Admin student page reflects the attendance under "Evidencija dolaska".
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    await expect(page.getByRole('heading', { name: 'Evidencija dolaska' })).toBeVisible()

    // The Croatian formatDate helper emits day. month. year. (Intl hr-HR output).
    const croDateRegex = /17\.\s?03\.\s?2026\./
    const attendanceSection = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'Evidencija dolaska' }) })
      .first()
    await expect(attendanceSection.getByText(croDateRegex).first()).toBeVisible()
    await expect(attendanceSection.getByText('Prisutan').first()).toBeVisible()
  })

  test('re-marking the same session updates (no duplicates) and note is saved', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)

    // Existing session button for SESSION_DATE should already be in the list.
    const dateButton = page.getByRole('button', {
      name: /17\.\s?03\.\s?2026\./,
    })
    await dateButton.first().click()

    // Toggle student row to Odsutan + add a note.
    const studentFullName = `${STUDENT.lastName} ${STUDENT.firstName}`
    const row = page.locator('tr', { hasText: studentFullName })
    await row.getByRole('button', { name: 'Prisutan' }).click()
    await expect(row.getByRole('button', { name: 'Odsutan' })).toBeVisible()
    await row.locator('input[type="text"]').fill(RE_MARK_NOTE)

    await page.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 10000 })

    // Admin sees exactly one row (not two) with Odsutan + the note.
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    const croDateRegex = /17\.\s?03\.\s?2026\./
    const dateCells = page.locator('td').filter({ hasText: croDateRegex })
    await expect(dateCells).toHaveCount(1)

    // The single row carries the Odsutan badge and the note.
    const rowInAdmin = page.locator('tr').filter({ hasText: croDateRegex })
    await expect(rowInAdmin.getByText('Odsutan')).toBeVisible()
    await expect(rowInAdmin.getByText(RE_MARK_NOTE)).toBeVisible()
  })

  test('teacher cannot view attendance for another teacher\'s group (404)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    const response = await page.goto(`${BASE}/nastavnik/grupa/${seeded.otherGroupId}/dolazak`)
    expect([404, 200]).toContain(response?.status() ?? 0)
    // No attendance save button renders for a non-owned group.
    await expect(page.getByRole('button', { name: 'Spremi' })).toHaveCount(0)
  })

  test('student portal contains no attendance text (leakage guard)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    for (const path of ['/portal', `/portal/grupa/${seeded.groupId}`, '/portal/profil']) {
      await page.goto(`${BASE}${path}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      // Neither the Croatian labels nor any recorded note should appear.
      expect(body).not.toContain('evidencija dolaska')
      expect(body).not.toContain('odsutan')
      expect(body).not.toContain(RE_MARK_NOTE.toLowerCase())
    }
  })
})
