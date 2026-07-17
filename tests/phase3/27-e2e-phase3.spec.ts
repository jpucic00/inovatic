import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  addLinkMaterial,
  addMaterialOnProgramPage,
  getCourseIdForGroup,
  croatianDateRegex,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Eva',
  lastName: `E2E${RUN_ID}`,
  email: `eva.e2e.${RUN_ID}@test.com`,
  phone: '0914440001',
}
const STUDENT: StudentData = {
  firstName: 'Nora',
  lastName: `E2EKid${RUN_ID}`,
  dateOfBirth: '2016-04-04',
  childSchool: 'OŠ E2E',
  parentName: `Roditelj E2E ${RUN_ID}`,
  parentEmail: `e2e.kid.${RUN_ID}@test.com`,
  parentPhone: '0914445555',
}

const COURSE_MATERIAL = `E2E program material ${RUN_ID}`
const GROUP_MATERIAL = `E2E grupa material ${RUN_ID}`
const REVIEW_TEXT = `E2E recenzija ${RUN_ID} — odličan napredak.`
const SESSION_DATE = '2026-03-10'

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  studentLogin: { email: string; password: string }
  studentId: string
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 16 — End-to-end', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const groupId = pickStandardGroupId(page)
    const t = await createTeacher(page, TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    const s = await createStudentInGroup(page, groupId, STUDENT)
    // Program curriculum is admin-owned and lives on the program detail page.
    // Seed a program-wide (COURSE) material — always visible to kids regardless
    // of the active module — so the teacher flow can hide it and the student
    // can see/lose it deterministically.
    const courseId = await getCourseIdForGroup(page, groupId)
    await addMaterialOnProgramPage(
      page,
      courseId,
      'Materijali za cijeli program',
      COURSE_MATERIAL,
      'https://example.com/e2e/program',
    )
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

  test('teacher uploads GROUP material, marks attendance, writes review', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)
    // Teacher may only add GROUP materials; the program-wide material was seeded
    // by admin in beforeAll and appears here as inherited (read-only) curriculum.
    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      GROUP_MATERIAL,
      'https://example.com/e2e/group',
    )
    // Titles can render in both the manage list and the student preview —
    // assert the first match to avoid strict-mode tripping on the duplicate.
    await expect(page.getByText(COURSE_MATERIAL).first()).toBeVisible()
    await expect(page.getByText(GROUP_MATERIAL).first()).toBeVisible()

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)
    const dateInput = page.locator('input[type="date"]')
    await dateInput.waitFor({ state: 'visible', timeout: 20000 })
    await dateInput.fill(SESSION_DATE)
    await dateInput.evaluate((el) =>
      el.dispatchEvent(new Event('input', { bubbles: true })),
    )
    const addBtn = page.getByRole('button', { name: 'Dodaj' })
    await expect(addBtn).toBeEnabled({ timeout: 10000 })
    await addBtn.click()
    // Wait for React to commit setSelected(SESSION_DATE) before Spremi reads it;
    // see markSession in tests/helpers/phase3.ts for the same workaround.
    await expect(
      page.getByRole('heading', { level: 3, name: croatianDateRegex(SESSION_DATE) }),
    ).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 30000 })

    // Fill the structured report card (Ocjena) — replaced MODULE_REVIEW 2026-07.
    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)
    await page.waitForLoadState('domcontentloaded')
    const opisnaInput = page.getByLabel('Opisna ocjena')
    await opisnaInput.waitFor({ state: 'visible', timeout: 30000 })
    await page.getByRole('button', { name: 'Ostvareno' }).first().click()
    await opisnaInput.fill(REVIEW_TEXT)
    const saveCard = page.getByRole('button', { name: 'Spremi ocjenu' })
    await expect(saveCard).toBeEnabled({ timeout: 10000 })
    await saveCard.click()
    await expect(page.getByText('Ocjena spremljena.')).toBeVisible({ timeout: 30000 })
  })

  test('admin sees attendance + review on the student page for the current school year', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)

    await expect(page.getByRole('heading', { name: 'Evidencija dolaska' })).toBeVisible()
    await expect(page.getByText(/10\.\s?03\.\s?2026\./).first()).toBeVisible()
    await expect(page.getByText('Prisutan').first()).toBeVisible()

    await expect(page.getByLabel('Opisna ocjena').first()).toHaveValue(REVIEW_TEXT)
    await expect(
      page.getByRole('button', { name: 'Ostvareno' }).first(),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/20\d{2}\/20\d{2}/).first()).toBeVisible()
  })

  test('student lands on portal, sees materials, no attendance or review leaks', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    // Titles can render in both the manage list and the student preview —
    // assert the first match to avoid strict-mode tripping on the duplicate.
    await expect(page.getByText(COURSE_MATERIAL).first()).toBeVisible()
    await expect(page.getByText(GROUP_MATERIAL).first()).toBeVisible()

    for (const path of ['/portal', `/portal/grupa/${seeded.groupId}`, '/portal/profil']) {
      await page.goto(`${BASE}${path}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain(REVIEW_TEXT.toLowerCase())
      expect(body).not.toContain('evidencija dolaska')
      expect(body).not.toContain('odsutan')
      expect(body).not.toContain('opisna ocjena')
      expect(body).not.toContain('preporuka')
    }
  })

  test('teacher hides program-wide material → student loses it (GROUP material stays)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const row = page.locator('li', { has: page.getByText(COURSE_MATERIAL) })
    await row.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
    await expect(row.getByText('Sakriveno u grupi')).toBeVisible({ timeout: 5000 })

    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(COURSE_MATERIAL)).toHaveCount(0)
    await expect(page.getByText(GROUP_MATERIAL)).toBeVisible()
  })
})
