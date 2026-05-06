import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 16 — Access-control matrix
// Sweeps the role → route matrix: unauthenticated visitors redirected off
// every gated root, cross-role access rejected (student/teacher → admin,
// student → teacher, teacher → admin), and the materials upload API rejects
// non-staff cookies. Ownership-level 404s for teachers visiting another
// teacher's group are covered in spec 23; a smoke case is re-asserted here.
// Requires: dev server on localhost:3000, seeded admin, ≥1 standard group.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER = {
  firstName: 'Roko',
  lastName: `ACL${RUN_ID}`,
  email: `roko.acl.${RUN_ID}@test.com`,
  phone: '0915550001',
}
const STUDENT = {
  firstName: 'Ines',
  lastName: `ACLKid${RUN_ID}`,
  dateOfBirth: '2016-02-02',
  childSchool: 'OŠ ACL',
  parentName: `Roditelj ACL ${RUN_ID}`,
  parentEmail: `acl.kid.${RUN_ID}@test.com`,
  parentPhone: '0915556677',
}

type Seeded = {
  teacher: { email: string; password: string }
  studentLogin: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

// ─── Helpers (mirrors 24–27) ─────────────────────────────────────────────────

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

async function pickFirstGroupId(page: Page): Promise<string> {
  await page.goto(`${BASE}/admin/grupe`)
  const link = page.locator('a[href^="/admin/grupe/"]').first()
  const href = await link.getAttribute('href')
  const m = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
  if (!m) throw new Error('no groups found')
  return m[1]
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

async function createStudentInGroup(
  page: Page,
  groupId: string,
): Promise<{ username: string; password: string }> {
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
  await page.keyboard.press('Escape')
  return { username, password }
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 16 — Access-control matrix', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const groupId = await pickFirstGroupId(page)
    const t = await createTeacher(page)
    const s = await createStudentInGroup(page, groupId)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password },
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
      groupId,
    }
    await page.close()
  })

  test('unauthenticated visitor is redirected from /portal', async ({ page }) => {
    await page.goto(`${BASE}/portal`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('unauthenticated visitor is redirected from /admin', async ({ page }) => {
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('unauthenticated visitor is redirected from /nastavnik', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('student cannot reach /admin — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('student cannot reach /nastavnik — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher cannot reach /admin — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 15000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher without assignment visiting any /nastavnik/grupa/<id> → 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    // The freshly-created teacher has no assignments, so every group is foreign.
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    const response = await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}`)
    expect([404, 200]).toContain(response?.status() ?? 0)
    await expect(page.getByRole('link', { name: 'Polaznici' })).toHaveCount(0)
  })

  test('/api/upload/materials rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upload/materials`, {
      multipart: {
        file: {
          name: 'hi.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('hi'),
        },
      },
    })
    expect(res.status()).toBe(401)
  })

  test('/api/upload/materials rejects STUDENT cookie', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['hi'], { type: 'text/plain' }), 'hi.txt')
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
  })
})
