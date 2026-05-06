import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 13 — Materials (CRUD + scope + hide-in-group + upload route)
// Uses LINK-type materials throughout so no real Cloudinary upload is needed;
// the /api/upload/materials route is tested separately with direct fetches.
// Requires: dev server on localhost:3000, seeded admin user, at least one
// ScheduledGroup on a standard course (has modules).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const TEACHER = {
  firstName: 'Dino',
  lastName: `MatNast${RUN_ID}`,
  email: `dino.matnast.${RUN_ID}@test.com`,
  phone: '0919111111',
}
const STUDENT = {
  firstName: 'Iva',
  lastName: `MatKid${RUN_ID}`,
  dateOfBirth: '2016-07-07',
  childSchool: 'OŠ Mat',
  parentName: `Roditelj Mat ${RUN_ID}`,
  parentEmail: `mat.kid.${RUN_ID}@test.com`,
  parentPhone: '0911110001',
}

const GROUP_LINK_TITLE = `Grupni LINK ${RUN_ID}`
const MODULE_LINK_TITLE = `Modulni LINK ${RUN_ID}`

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  student: { email: string; password: string }
  groupId: string
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

async function pickStandardGroupId(page: Page): Promise<string> {
  // Walk admin/grupe; for each listed group, open detail and check whether
  // the Moduli section renders — standard courses have modules, radionice
  // don't. We return the first group id whose detail shows module list items.
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
  throw new Error('no standard-course group found (all radionice?)')
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

async function createStudentInGroup(page: Page, groupId: string): Promise<{ username: string; password: string }> {
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
  await page.keyboard.press('Escape')
  return { username, password }
}

/** Opens the UploadMaterialDialog for the button labelled `buttonLabel` and
 *  submits a LINK-type material with the given title + URL. */
async function addLinkMaterial(page: Page, buttonLabelRegex: RegExp, title: string, url: string) {
  await page.getByRole('button', { name: buttonLabelRegex }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('#material-title').fill(title)
  // Pick the LINK radio card.
  await dialog.locator('label', { hasText: 'Poveznica' }).click()
  // URL field appears once LINK is active.
  await dialog.locator('#material-external-url').fill(url)
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  // Dialog closes on success.
  await expect(dialog).toBeHidden({ timeout: 10000 })
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 13 — Materials', () => {
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
      student: { email: `${s.username}@student.inovatic.local`, password: s.password },
      groupId,
    }
    await page.close()
  })

  test('teacher navbar has a "Materijali" link', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Materijali' }).first()).toBeVisible()
  })

  test('teacher creates a GROUP LINK material and student sees it', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      GROUP_LINK_TITLE,
      'https://drive.google.com/file/d/abc123',
    )
    // Back on the materijali page, the new row is visible.
    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
  })

  test('teacher creates a MODULE LINK material and student sees it in the group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // Attach to the first listed MODULE (button label is "Dodaj u modul: ...").
    await addLinkMaterial(
      page,
      /Dodaj u modul:/,
      MODULE_LINK_TITLE,
      'https://example.com/module-resource',
    )
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  test('student portal renders both GROUP and MODULE materials', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)

    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  test('teacher hides the MODULE material in this group — student no longer sees it', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // The row carrying MODULE_LINK_TITLE has a hide toggle (MODULE scope).
    const row = page.locator('li', { has: page.getByText(MODULE_LINK_TITLE) })
    await row.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
    await expect(row.getByText('Sakriveno u grupi')).toBeVisible({ timeout: 5000 })

    // Student loses it on this group.
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toHaveCount(0)
    // GROUP material still present.
    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
  })

  test('teacher deletes the GROUP material — student loses it too', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // `window.confirm` is blocking; accept automatically.
    page.on('dialog', (d) => d.accept())

    const row = page.locator('li', { has: page.getByText(GROUP_LINK_TITLE) })
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(GROUP_LINK_TITLE)).toHaveCount(0)
  })

  test('/api/upload/materials rejects a STUDENT cookie', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['hi'], { type: 'text/plain' }), 'hi.txt')
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
  })

  test('/api/upload/materials rejects an unsupported MIME', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 15000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append(
        'file',
        new Blob(['x'], { type: 'application/x-custom-unsupported' }),
        'weird.bin',
      )
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  test('admin materials page lists existing materials with search + filters', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/materijali?q=${encodeURIComponent(MODULE_LINK_TITLE)}`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })
})
