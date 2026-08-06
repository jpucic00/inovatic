import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  createStudentNoEnrollment,
  createStudentInGroup,
  collectGroupIds,
  addEnrollmentToStudent,
  getGroupCourseTitle,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const ZERO_STUDENT: StudentData = {
  firstName: 'Pero',
  lastName: `NulaUpisa${RUN_ID}`,
  dateOfBirth: '2015-06-15',
  childSchool: 'OŠ Marjan',
  parentName: `Mate NulaUpisa ${RUN_ID}`,
  parentEmail: `mate.nulaupisa.${RUN_ID}@test.com`,
  parentPhone: '0911111111',
}

const SINGLE_STUDENT: StudentData = {
  firstName: 'Kata',
  lastName: `JedanUpis${RUN_ID}`,
  dateOfBirth: '2016-02-10',
  childSchool: 'OŠ Firule',
  parentName: `Ana JedanUpis ${RUN_ID}`,
  parentEmail: `ana.jedanupis.${RUN_ID}@test.com`,
  parentPhone: '0911111112',
}

const MULTI_STUDENT: StudentData = {
  firstName: 'Luka',
  lastName: `DvaUpisa${RUN_ID}`,
  dateOfBirth: '2015-11-20',
  childSchool: 'OŠ Bol',
  parentName: `Pero DvaUpisa ${RUN_ID}`,
  parentEmail: `pero.dvaupisa.${RUN_ID}@test.com`,
  parentPhone: '0911111113',
}

let zeroCredentials: { username: string; password: string; loginEmail: string } | null = null
let singleCredentials: { username: string; password: string; loginEmail: string; groupId: string; courseTitle: string } | null = null
let multiCredentials: { username: string; password: string; loginEmail: string; groupAId: string; groupBId: string } | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 10 — Student Portal Shell', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Zero-enrollment student
    const zeroCreds = await createStudentNoEnrollment(page, ZERO_STUDENT)
    zeroCredentials = {
      ...zeroCreds,
      loginEmail: `${zeroCreds.username}@student.inovatic.local`,
    }

    // Single-enrollment student
    const [groupA, groupB] = collectGroupIds(page, 2)
    const courseTitle = await getGroupCourseTitle(page, groupA)
    const singleCreds = await createStudentInGroup(page, groupA, SINGLE_STUDENT)
    singleCredentials = {
      username: singleCreds.username,
      password: singleCreds.password,
      loginEmail: `${singleCreds.username}@student.inovatic.local`,
      groupId: groupA,
      courseTitle,
    }

    // Multi-enrollment student (2 groups)
    const multiCreds = await createStudentInGroup(page, groupA, MULTI_STUDENT)
    await addEnrollmentToStudent(page, multiCreds.studentId, groupB)
    multiCredentials = {
      username: multiCreds.username,
      password: multiCreds.password,
      loginEmail: `${multiCreds.username}@student.inovatic.local`,
      groupAId: groupA,
      groupBId: groupB,
    }

    await page.close()
  })

  // ── Redirects ──────────────────────────────────────────────────────────────

  test('unauthenticated visitor gets the login screen in place on /portal', async ({ page }) => {
    // /portal doubles as the sign-in URL — the login form renders directly,
    // with no redirect (every guard points here, so bouncing would loop).
    await page.goto(`${BASE}/portal`)
    await expect(page.locator('h1')).toHaveText('Prijava')
    expect(page.url()).toContain('/portal')
  })

  test('admin on /portal is bounced to /admin', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/portal`)
    await page.waitForURL(/\/admin/, { timeout: 30000 })
    expect(page.url()).toContain('/admin')
  })

  // ── Zero-enrollment experience ─────────────────────────────────────────────

  test('zero-enrollment student lands on empty state with Croatian copy', async ({ page }) => {
    if (!zeroCredentials) throw new Error('zero-enrollment student not seeded')
    await loginWithEmail(page, zeroCredentials.loginEmail, zeroCredentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await expect(page.getByRole('heading', { name: 'Dobrodošli' })).toBeVisible()
    await expect(page.getByText(/Nemate aktivnih upisa\. Obratite se administratoru\./)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Moje grupe' })).toHaveCount(0)
  })

  test('zero-enrollment student sees their profile read-only with parent info', async ({ page }) => {
    if (!zeroCredentials) throw new Error('zero-enrollment student not seeded')
    await loginWithEmail(page, zeroCredentials.loginEmail, zeroCredentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/profil`)

    await expect(
      page.getByRole('heading', { name: `${ZERO_STUDENT.firstName} ${ZERO_STUDENT.lastName}` }),
    ).toBeVisible()

    await expect(page.getByText('Korisničko ime', { exact: true })).toBeVisible()
    await expect(page.getByText(zeroCredentials.username, { exact: true })).toBeVisible()
    await expect(page.getByText(ZERO_STUDENT.childSchool)).toBeVisible()

    await expect(page.getByText('Roditelj / skrbnik')).toBeVisible()
    await expect(page.getByText(ZERO_STUDENT.parentName)).toBeVisible()
    await expect(page.getByText(ZERO_STUDENT.parentEmail)).toBeVisible()
    await expect(page.getByText(ZERO_STUDENT.parentPhone)).toBeVisible()

    await expect(page.getByRole('button', { name: /Uredi|Spremi/ })).toHaveCount(0)
  })

  test('student portal does NOT expose comment/grade UI (internal-staff-only leakage guard)', async ({ page }) => {
    if (!zeroCredentials) throw new Error('zero-enrollment student not seeded')
    await loginWithEmail(page, zeroCredentials.loginEmail, zeroCredentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('komentar')
    expect(body).not.toContain('bilješk')
    expect(body).not.toContain('recenzij')
    expect(body).not.toContain('ocjen')
  })

  // ── C1: Single-enrollment inline dashboard ─────────────────────────────────

  test('single-enrollment student sees inline materials view with course info and gallery link', async ({ page }) => {
    if (!singleCredentials) throw new Error('single-enrollment student not seeded')
    await loginWithEmail(page, singleCredentials.loginEmail, singleCredentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await expect(page.getByRole('heading', { name: singleCredentials.courseTitle })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Moje grupe' })).toHaveCount(0)

    await expect(page.locator(`a[href="/portal/grupa/${singleCredentials.groupId}/galerija"]`)).toBeVisible()

    const hasEmpty = await page.getByText(/Još nema materijala za ovu grupu\./).count()
    const hasModuleHeading = await page.locator('main h2').count()
    expect(
      hasEmpty > 0 || hasModuleHeading > 0,
      'Expected either an empty-state message or module headings in main content',
    ).toBe(true)
  })

  // ── C2: Multi-enrollment grid ──────────────────────────────────────────────

  test('multi-enrollment student sees group cards grid with navigation', async ({ page }) => {
    if (!multiCredentials) throw new Error('multi-enrollment student not seeded')
    await loginWithEmail(page, multiCredentials.loginEmail, multiCredentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await expect(page.getByRole('heading', { name: 'Moje grupe' })).toBeVisible()
    await expect(page.getByText('Odaberite grupu za pregled materijala.')).toBeVisible()

    const cardA = page.locator(`a[href="/portal/grupa/${multiCredentials.groupAId}"]`)
    const cardB = page.locator(`a[href="/portal/grupa/${multiCredentials.groupBId}"]`)
    await expect(cardA).toBeVisible()
    await expect(cardB).toBeVisible()

    await cardA.click()
    await page.waitForURL(new RegExp(`/portal/grupa/${multiCredentials.groupAId}`), { timeout: 30000 })
    await expect(page.locator('h1')).toBeVisible()
  })
})
