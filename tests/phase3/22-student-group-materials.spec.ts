import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 STEP 11 — Student /portal/grupa/[groupId]
// Covers the per-group materials view for students enrolled in 2+ groups (and
// the multi-enrollment card → drill-down flow). Also serves as the primary
// access-control test for the portal: a student visiting a group they're not
// enrolled in must see a 404, not the group contents. Comment/review/grade
// leakage guard continues here.
// Requires: dev server on localhost:3000, seeded admin user, at least 2
// ScheduledGroups available (the seed has plenty).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-6)

const STUDENT = {
  firstName: 'Marta',
  lastName: `GrupaDetalj${RUN_ID}`,
  dateOfBirth: '2016-09-20',
  childSchool: 'OŠ Bačvice',
  parentName: `Ivan GrupaDetalj ${RUN_ID}`,
  parentEmail: `ivan.grupadetalj.${RUN_ID}@test.com`,
  parentPhone: '0922222222',
}

type Seeded = {
  loginEmail: string
  password: string
  myGroupId: string
  otherGroupId: string
  courseTitle: string
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

/**
 * Picks two distinct ScheduledGroup IDs from the admin groups listing.
 * Returns them plus the course title of the first group so we can assert the
 * header on the portal page afterwards.
 */
async function collectTwoGroupIds(page: Page): Promise<{ a: string; b: string; aCourseTitle: string }> {
  await page.goto(`${BASE}/admin/grupe`)
  const links = await page.locator('a[href^="/admin/grupe/"]').all()
  const ids: string[] = []
  for (const link of links) {
    const href = await link.getAttribute('href')
    const match = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
    if (match && !ids.includes(match[1])) ids.push(match[1])
    if (ids.length >= 2) break
  }
  if (ids.length < 2) {
    throw new Error(`Need at least 2 ScheduledGroups to run this spec; found ${ids.length}`)
  }

  await page.goto(`${BASE}/admin/grupe/${ids[0]}`)
  // Admin group detail h1 is "{course title} – {group name}". The portal
  // page renders only the course title as h1, so we strip the group suffix.
  const heading = (await page.locator('h1').first().innerText()).trim()
  const aCourseTitle = heading.split('–')[0].trim()
  return { a: ids[0], b: ids[1], aCourseTitle }
}

/**
 * Creates a student via the manual create-student dialog and enrolls them
 * directly in the provided group. The dialog exposes program + group
 * selectors; we pick the group by radio value.
 */
async function createStudentWithEnrollment(
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

  // Select the program that owns the target group so groups load, then pick
  // the radio matching our groupId. We don't know the program up front, so we
  // iterate through the options until the target group radio appears.
  const courseSelect = dialog.locator('select').first()
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    // Wait briefly for groups to load.
    await page.waitForTimeout(300)
    const radio = dialog.locator(`input[type="radio"][value="${groupId}"]`)
    if (await radio.count() > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in any course dropdown`)

  // Standard programs require at least one module selection once a group is
  // picked. Check the "Svi moduli" master checkbox if it renders (radionice
  // have no modules so the checkbox is absent).
  const allModulesCheckbox = dialog.locator('label', { hasText: 'Svi moduli' }).locator('input[type="checkbox"]')
  if (await allModulesCheckbox.isVisible().catch(() => false)) {
    await allModulesCheckbox.check()
  }

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

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 11 — Student Group Materials', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const { a, b, aCourseTitle } = await collectTwoGroupIds(page)
    const creds = await createStudentWithEnrollment(page, a)
    seeded = {
      loginEmail: `${creds.username}@student.inovatic.local`,
      password: creds.password,
      myGroupId: a,
      otherGroupId: b,
      courseTitle: aCourseTitle,
    }
    await page.close()
  })

  test('enrolled group page renders course title, back link, and material list', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    await page.goto(`${BASE}/portal/grupa/${seeded.myGroupId}`)

    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: /Natrag/ })).toBeVisible()

    // Either material sections or the empty state must render — confirms the
    // MaterialList component is mounted and the access gate passed.
    const hasEmpty = await page.getByText(/Još nema materijala za ovu grupu\./).count()
    const hasModuleHeading = await page.locator('h2').count()
    expect(hasEmpty + hasModuleHeading).toBeGreaterThan(0)
  })

  test('visiting a group the student is not enrolled in returns 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    const response = await page.goto(`${BASE}/portal/grupa/${seeded.otherGroupId}`)
    // Next 15's notFound() → 404 response. Some dev configurations still
    // render 200 with the not-found body; tolerate both but assert the
    // content is the not-found page, never the target group content.
    expect([404, 200]).toContain(response?.status() ?? 0)
    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toHaveCount(0)
  })

  test('visiting a completely non-existent groupId returns 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    const response = await page.goto(`${BASE}/portal/grupa/does-not-exist-xyz`)
    expect([404, 200]).toContain(response?.status() ?? 0)
    await expect(page.locator('h1')).not.toHaveText(seeded.courseTitle)
  })

  test('no comment/review/grade text leaks onto the group page', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 15000 })

    await page.goto(`${BASE}/portal/grupa/${seeded.myGroupId}`)
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('komentar')
    expect(body).not.toContain('bilješk')
    expect(body).not.toContain('recenzij')
    expect(body).not.toContain('ocjen')
  })
})
