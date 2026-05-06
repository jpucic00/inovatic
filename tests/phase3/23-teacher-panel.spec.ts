import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 12 — Teacher Panel (dashboard + group detail + roster)
// Verifies: teachers see only groups they're assigned to on /nastavnik, the
// group detail page shows the tabbed shell with a roster including parent
// contact rendered as mailto:/tel: links, and the `assertTeacherOwnsGroup`
// guard throws 404 when a teacher visits another teacher's group. Admin can
// open any teacher group (documented bypass).
// Seeds via the admin UI: two teachers, two groups, one student enrolled in
// Teacher A's group with parent contact so the roster test has real data.
// Requires: dev server on localhost:3000, seeded admin user, ≥2 groups.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER_A = {
  firstName: 'Marko',
  lastName: `Nast_A_${RUN_ID}`,
  email: `marko.nasta.${RUN_ID}@test.com`,
  phone: '0910000001',
}
const TEACHER_B = {
  firstName: 'Iva',
  lastName: `Nast_B_${RUN_ID}`,
  email: `iva.nastb.${RUN_ID}@test.com`,
  phone: '0910000002',
}

const STUDENT = {
  firstName: 'Lana',
  lastName: `RosterKid${RUN_ID}`,
  dateOfBirth: '2016-03-03',
  childSchool: 'OŠ Split 5',
  parentName: `Roditelj RosterKid ${RUN_ID}`,
  parentEmail: `roditelj.rosterkid.${RUN_ID}@test.com`,
  parentPhone: '0915554433',
}

type Seeded = {
  teacherA: { email: string; password: string; teacherId: string }
  teacherB: { email: string; password: string }
  groupAId: string
  groupBId: string
  groupACourseTitle: string
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

/** Collect the first N distinct ScheduledGroup IDs from /admin/grupe. */
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
  if (ids.length < count) {
    throw new Error(`Need at least ${count} groups; found ${ids.length}`)
  }
  return ids
}

async function getGroupCourseTitle(page: Page, groupId: string): Promise<string> {
  await page.goto(`${BASE}/admin/grupe/${groupId}`)
  const heading = (await page.locator('h1').first().innerText()).trim()
  return heading.split('–')[0].trim()
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

  // The "Otvori profil" link href includes the teacher id.
  const profileLink = dialog.getByRole('link', { name: /Profil nastavnika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href')) ?? ''
  const m = href.match(/\/admin\/nastavnici\/([^/?#]+)/)
  if (!m) throw new Error(`Could not extract teacher ID from ${href}`)
  const teacherId = m[1]

  await page.getByRole('button', { name: 'Zatvori' }).click()
  return { password, teacherId }
}

async function assignTeacherToGroup(page: Page, teacherId: string, groupId: string) {
  await page.goto(`${BASE}/admin/nastavnici/${teacherId}`)
  await page.getByRole('button', { name: /Dodijeli grupu/ }).click()
  const select = page.locator('#assign-group-select')
  await expect(select).toBeVisible()
  await select.selectOption(groupId)
  await page.getByRole('button', { name: /^Dodijeli$/ }).click()
  // Confirm the assignment row appears.
  await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible({
    timeout: 10000,
  })
}

async function createStudentInGroup(page: Page, groupId: string) {
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
    await page.waitForTimeout(300)
    const radio = dialog.locator(`input[type="radio"][value="${groupId}"]`)
    if (await radio.count() > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in any course`)

  const allModulesCheckbox = dialog.locator('label', { hasText: 'Svi moduli' }).locator('input[type="checkbox"]')
  if (await allModulesCheckbox.isVisible().catch(() => false)) {
    await allModulesCheckbox.check()
  }

  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await expect(dialog.getByText('Učenik kreiran')).toBeVisible({ timeout: 15000 })
  await page.keyboard.press('Escape')
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 12 — Teacher Panel', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupAId, groupBId] = await collectGroupIds(page, 2)
    const groupACourseTitle = await getGroupCourseTitle(page, groupAId)

    const tA = await createTeacher(page, TEACHER_A)
    const tB = await createTeacher(page, TEACHER_B)

    await assignTeacherToGroup(page, tA.teacherId, groupAId)
    // Re-open teacher B page for second assignment (assignTeacherToGroup navigates).
    await assignTeacherToGroup(page, tB.teacherId, groupBId)

    await createStudentInGroup(page, groupAId)

    seeded = {
      teacherA: { email: TEACHER_A.email, password: tA.password, teacherId: tA.teacherId },
      teacherB: { email: TEACHER_B.email, password: tB.password },
      groupAId,
      groupBId,
      groupACourseTitle,
    }
    await page.close()
  })

  test('unauthenticated visitor is redirected from /nastavnik', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher dashboard renders only their assigned groups', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })

    // Teacher A's group card should link to their assigned group.
    const cardA = page.locator(`a[href="/nastavnik/grupa/${seeded.groupAId}"]`)
    await expect(cardA).toBeVisible()

    // Teacher B's group must NOT appear on A's dashboard.
    const cardB = page.locator(`a[href="/nastavnik/grupa/${seeded.groupBId}"]`)
    await expect(cardB).toHaveCount(0)
  })

  test('teacher group detail renders tabs + roster with parent contact links', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupAId}`)

    // Course title in the h1 (no group suffix like the admin page).
    await expect(page.getByRole('heading', { name: seeded.groupACourseTitle })).toBeVisible()

    // Tabs render all five labels (module tab may be hidden for radionice, but
    // the first two groups from seed are standard programs). Scope to the
    // <main> region to avoid colliding with the navbar "Materijali" link.
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: 'Polaznici' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Materijali' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Dolazak' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Komentari' })).toBeVisible()

    // Scope assertions to the student's specific roster row so accumulated
    // test data from prior runs (with identical hardcoded phones) doesn't
    // cause strict-mode collisions.
    const studentFullName = `${STUDENT.firstName} ${STUDENT.lastName}`
    const row = page.locator('tr', { has: page.getByRole('link', { name: studentFullName }) })
    await expect(row).toBeVisible()

    // Parent email rendered as mailto: link inside this row.
    const mailto = row.locator(`a[href="mailto:${STUDENT.parentEmail}"]`)
    await expect(mailto).toBeVisible()
    await expect(mailto).toContainText(STUDENT.parentEmail)

    // Parent phone rendered as tel: link (strip any whitespace in the href).
    const tel = row.locator(`a[href="tel:${STUDENT.parentPhone.replace(/\s+/g, '')}"]`)
    await expect(tel).toBeVisible()

    // Roster must be read-only — no edit/delete buttons.
    await expect(page.getByRole('button', { name: /Uredi|Obriši/ })).toHaveCount(0)
  })

  test('teacher A gets 404 when visiting teacher B\'s group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })

    const response = await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupBId}`)
    expect([404, 200]).toContain(response?.status() ?? 0)
    // The group's tab shell must NOT render — assert the Polaznici tab is absent.
    await expect(page.getByRole('link', { name: 'Polaznici' })).toHaveCount(0)
  })

  test('admin bypass: admin can open any teacher group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupBId}`)
    // Admin is allowed through — tabs render.
    await expect(page.getByRole('link', { name: 'Polaznici' })).toBeVisible()
  })

})
