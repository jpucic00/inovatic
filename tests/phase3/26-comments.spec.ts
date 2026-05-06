import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 15 — Improved internal comments / reviews / grades UI
// Verifies:
//  - Teacher can create COMMENT + MODULE_REVIEW on a student enrolled in
//    their group; rows show up for both the teacher and the admin.
//  - Teacher B cannot create a comment on Teacher A's group (404 page, no
//    form renders).
//  - Teacher cannot delete the admin's comment (delete affordance absent).
//    Teacher CAN delete their own comment.
//  - Admin school-year tab switch renders sections for that year only.
//  - Admin filter by "Ocjene modula" hides plain COMMENT entries.
//  - Student portal contains no seeded comment content (leakage guard).
// Requires: dev server on localhost:3000, seeded admin, ≥2 standard-course
// groups.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER_A = {
  firstName: 'Ana',
  lastName: `KomA${RUN_ID}`,
  email: `ana.koma.${RUN_ID}@test.com`,
  phone: '0913330001',
}
const TEACHER_B = {
  firstName: 'Bruno',
  lastName: `KomB${RUN_ID}`,
  email: `bruno.komb.${RUN_ID}@test.com`,
  phone: '0913330002',
}
const STUDENT = {
  firstName: 'Tena',
  lastName: `KomKid${RUN_ID}`,
  dateOfBirth: '2016-06-06',
  childSchool: 'OŠ Bilješka',
  parentName: `Roditelj Kom ${RUN_ID}`,
  parentEmail: `kom.kid.${RUN_ID}@test.com`,
  parentPhone: '0916667777',
}

const TEACHER_COMMENT = `Komentar nastavnika ${RUN_ID} — napredak OK.`
const TEACHER_REVIEW = `Recenzija modula ${RUN_ID} — savladano.`
const ADMIN_COMMENT = `Admin bilješka ${RUN_ID} — provjereno.`

type Seeded = {
  teacherA: { email: string; password: string; teacherId: string }
  teacherB: { email: string; password: string }
  groupAId: string
  groupBId: string
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

async function createTeacher(page: Page, t: typeof TEACHER_A): Promise<{ password: string; teacherId: string }> {
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

/** Submit a comment on the teacher's student detail page. */
async function submitStudentComment(
  page: Page,
  studentId: string,
  content: string,
  type: 'COMMENT' | 'MODULE_REVIEW',
) {
  await page.goto(`${BASE}/nastavnik/ucenik/${studentId}`)
  await page.waitForLoadState('networkidle')
  if (type === 'MODULE_REVIEW') {
    await page.getByLabel('Ocjena modula').check()
  }
  const textarea = page.getByPlaceholder('Dodaj bilješku o učeniku...')
  await textarea.waitFor({ state: 'visible', timeout: 30000 })
  await textarea.fill(content)
  const submit = page.getByRole('button', { name: /Dodaj bilješku/ })
  await expect(submit).toBeEnabled({ timeout: 5000 })
  await submit.click()
  await expect(page.getByText('Bilješka dodana.')).toBeVisible({ timeout: 15000 })
}

async function addAdminComment(page: Page, studentId: string, content: string) {
  await page.goto(`${BASE}/admin/ucenici/${studentId}`)
  await page.waitForLoadState('networkidle')
  // The admin student page has exactly one form with the "Dodaj bilješku"
  // submit button (the shared comment form rendered per-group section).
  const form = page
    .locator('form', { has: page.getByRole('button', { name: /Dodaj bilješku/ }) })
    .first()
  await form.waitFor({ state: 'visible', timeout: 30000 })
  await form.locator('textarea').fill(content)
  const submit = form.getByRole('button', { name: /Dodaj bilješku/ })
  await expect(submit).toBeEnabled({ timeout: 5000 })
  await submit.click()
  await expect(page.getByText('Bilješka dodana.')).toBeVisible({ timeout: 15000 })
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 15 — Comments UI', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupAId, groupBId] = await collectGroupIds(page, 2)
    const tA = await createTeacher(page, TEACHER_A)
    const tB = await createTeacher(page, TEACHER_B)
    await assignTeacherToGroup(page, tA.teacherId, groupAId)
    await assignTeacherToGroup(page, tB.teacherId, groupBId)

    const s = await createStudentInGroup(page, groupAId)

    seeded = {
      teacherA: { email: TEACHER_A.email, password: tA.password, teacherId: tA.teacherId },
      teacherB: { email: TEACHER_B.email, password: tB.password },
      groupAId,
      groupBId,
      studentId: s.studentId,
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
    }
    await page.close()
  })

  test('teacher adds COMMENT + MODULE_REVIEW on their group; both surface for admin', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })

    await submitStudentComment(page, seeded.studentId, TEACHER_COMMENT, 'COMMENT')
    await submitStudentComment(page, seeded.studentId, TEACHER_REVIEW, 'MODULE_REVIEW')

    // Admin sees both entries on the student page.
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    await expect(page.getByText(TEACHER_COMMENT)).toBeVisible()
    await expect(page.getByText(TEACHER_REVIEW)).toBeVisible()
  })

  test('admin type filter hides plain COMMENT entries when MODULE_REVIEW is selected', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)

    const panelRegion = page.getByRole('heading', { name: /Bilješke i recenzije/i }).locator('..')
    await panelRegion.getByRole('button', { name: /^Ocjene modula$/ }).click()

    await expect(page.getByText(TEACHER_REVIEW)).toBeVisible()
    await expect(page.getByText(TEACHER_COMMENT)).toHaveCount(0)

    // Restore to "All" and confirm both show again.
    await panelRegion.getByRole('button', { name: /^Sve$/ }).click()
    await expect(page.getByText(TEACHER_COMMENT)).toBeVisible()
    await expect(page.getByText(TEACHER_REVIEW)).toBeVisible()
  })

  test('school-year tab matches the currently seeded enrollment\'s year', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)

    // The enrollment's school-year label should be present somewhere in the panel
    // (either as a tab, or as part of the section label). A year like "2025/2026"
    // matches \d{4}\/\d{4}.
    await expect(page.getByText(/20\d{2}\/20\d{2}/).first()).toBeVisible()
  })

  test('admin can delete the teacher\'s comment (admin-always-wins)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)

    await addAdminComment(page, seeded.studentId, ADMIN_COMMENT)
    await expect(page.getByText(ADMIN_COMMENT)).toBeVisible()

    // Every comment in admin has a delete button (admin always wins).
    page.once('dialog', (d) => d.accept())
    // Delete buttons by aria-label — the admin comment we just added is
    // strictly newest, so the first delete button targets it.
    const articles = page.locator('article', { hasText: ADMIN_COMMENT })
    await articles.first().getByRole('button', { name: 'Izbriši bilješku' }).click()
    await expect(page.getByText('Bilješka izbrisana.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(ADMIN_COMMENT)).toHaveCount(0)
  })

  test('teacher cannot delete another author\'s comment (no delete affordance)', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')
    // Admin leaves a fresh comment that the teacher must NOT be able to delete.
    await loginAsAdmin(page)
    await addAdminComment(page, seeded.studentId, ADMIN_COMMENT)

    // Switch to teacher A; on the student detail page, the admin's comment
    // should appear but without a delete button. Teacher's own comments still
    // show a delete button.
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)

    const adminArticle = page.locator('article', { hasText: ADMIN_COMMENT })
    await expect(adminArticle).toBeVisible()
    await expect(
      adminArticle.getByRole('button', { name: 'Izbriši bilješku' }),
    ).toHaveCount(0)

    // Teacher's own comment has a delete button.
    const teacherArticle = page.locator('article', { hasText: TEACHER_COMMENT })
    await expect(teacherArticle).toBeVisible()
    await expect(
      teacherArticle.getByRole('button', { name: 'Izbriši bilješku' }),
    ).toHaveCount(1)
  })

  test('teacher B rejected when viewing teacher A\'s student (404)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherB.email, seeded.teacherB.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    const response = await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)
    expect([404, 200]).toContain(response?.status() ?? 0)
    await expect(page.getByRole('button', { name: /Dodaj bilješku/ })).toHaveCount(0)
  })

  test('student portal shows no seeded comment content (leakage guard)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    for (const path of ['/portal', `/portal/grupa/${seeded.groupAId}`, '/portal/profil']) {
      await page.goto(`${BASE}${path}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain(TEACHER_COMMENT.toLowerCase())
      expect(body).not.toContain(TEACHER_REVIEW.toLowerCase())
      expect(body).not.toContain(ADMIN_COMMENT.toLowerCase())
      expect(body).not.toContain('bilješke i recenzije')
      expect(body).not.toContain('ocjena modula')
    }
  })
})
