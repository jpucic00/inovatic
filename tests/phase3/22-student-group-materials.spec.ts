import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  getGroupCourseTitle,
  expectNotFoundPage,
  type StudentData,
} from '../helpers/phase3'
import { seedStudentInGroup } from '../helpers/seed'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'

const RUN_ID = newRunId()

// Teardown: every fixture this spec creates carries RUN_ID in its name, e-mail or
// title, so one call removes exactly this run's rows and can reach no other.
// Without it each run's groups stay for good, and `/admin/grupe` packs a
// weekday's groups into one lane — past a few dozen leftovers the entries go
// zero-width and specs that never changed start failing on the litter.
// Best-effort by design: it swallows, so a teardown problem can never turn a
// green run red.
test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

const STUDENT: StudentData = {
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

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 11 — Student Group Materials', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const [a, b] = collectGroupIds(page, 2)
    const aCourseTitle = await getGroupCourseTitle(page, a)
    await page.close()
    // Direct-Prisma seed (per the seed.ts convention) — capacity-independent, so
    // it doesn't break when the shared bootstrap group fills up across runs.
    const creds = await seedStudentInGroup(a, STUDENT)
    seeded = {
      loginEmail: `${creds.username}@student.inovatic.local`,
      password: creds.password,
      myGroupId: a,
      otherGroupId: b,
      courseTitle: aCourseTitle,
    }
  })

  test('enrolled group page renders course title, back link, and material list', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await page.goto(`${BASE}/portal/grupa/${seeded.myGroupId}`)

    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: /Natrag/ })).toBeVisible()

    const hasEmpty = await page.getByText(/Materijali još nisu objavljeni/).count()
    const hasModuleHeading = await page.locator('main h2').count()
    expect(
      hasEmpty > 0 || hasModuleHeading > 0,
      'Expected either an empty-state message or module headings in main content',
    ).toBe(true)
  })

  test('visiting a group the student is not enrolled in returns 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await page.goto(`${BASE}/portal/grupa/${seeded.otherGroupId}`)
    await expectNotFoundPage(page)
    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toHaveCount(0)
    await expect(page.getByText(/Materijali još nisu objavljeni/)).toHaveCount(0)
  })

  test('visiting a completely non-existent groupId returns 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await page.goto(`${BASE}/portal/grupa/does-not-exist-xyz`)
    await expectNotFoundPage(page)
    await expect(page.locator('h1')).not.toHaveText(seeded.courseTitle)
  })

  test('no comment/review/grade text leaks onto the group page', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.loginEmail, seeded.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await page.goto(`${BASE}/portal/grupa/${seeded.myGroupId}`)
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('komentar')
    expect(body).not.toContain('bilješk')
    expect(body).not.toContain('recenzij')
    expect(body).not.toContain('ocjen')
  })
})
