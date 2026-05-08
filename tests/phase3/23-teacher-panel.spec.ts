import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  getGroupCourseTitle,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER_A: TeacherData = {
  firstName: 'Marko',
  lastName: `Nast_A_${RUN_ID}`,
  email: `marko.nasta.${RUN_ID}@test.com`,
  phone: '0910000001',
}
const TEACHER_B: TeacherData = {
  firstName: 'Iva',
  lastName: `Nast_B_${RUN_ID}`,
  email: `iva.nastb.${RUN_ID}@test.com`,
  phone: '0910000002',
}

const STUDENT: StudentData = {
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
  studentId: string
}

let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 12 — Teacher Panel', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupAId, groupBId] = collectGroupIds(page, 2)
    const groupACourseTitle = await getGroupCourseTitle(page, groupAId)

    const tA = await createTeacher(page, TEACHER_A)
    const tB = await createTeacher(page, TEACHER_B)

    await assignTeacherToGroup(page, tA.teacherId, groupAId)
    await assignTeacherToGroup(page, tB.teacherId, groupBId)

    const s = await createStudentInGroup(page, groupAId, STUDENT)

    seeded = {
      teacherA: { email: TEACHER_A.email, password: tA.password, teacherId: tA.teacherId },
      teacherB: { email: TEACHER_B.email, password: tB.password },
      groupAId,
      groupBId,
      groupACourseTitle,
      studentId: s.studentId,
    }
    await page.close()
  })

  test('unauthenticated visitor is redirected from /nastavnik', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher dashboard renders only their assigned groups', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const cardA = page.locator(`a[href="/nastavnik/grupa/${seeded.groupAId}"]`)
    await expect(cardA).toBeVisible()

    const cardB = page.locator(`a[href="/nastavnik/grupa/${seeded.groupBId}"]`)
    await expect(cardB).toHaveCount(0)
  })

  test('teacher group detail renders tabs + roster with parent contact links', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupAId}`)

    await expect(page.getByRole('heading', { name: seeded.groupACourseTitle })).toBeVisible()

    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: 'Polaznici' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Materijali' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Dolazak' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Galerija' })).toBeVisible()

    const studentFullName = `${STUDENT.firstName} ${STUDENT.lastName}`
    const row = page.locator('tr', { has: page.getByRole('link', { name: studentFullName }) })
    await expect(row).toBeVisible()

    const mailto = row.locator(`a[href="mailto:${STUDENT.parentEmail}"]`)
    await expect(mailto).toBeVisible()
    await expect(mailto).toContainText(STUDENT.parentEmail)

    const tel = row.locator(`a[href="tel:${STUDENT.parentPhone.replace(/\s+/g, '')}"]`)
    await expect(tel).toBeVisible()

    await expect(page.getByRole('button', { name: /Uredi|Obriši/ })).toHaveCount(0)
  })

  test('teacher A gets 404 when visiting teacher B\'s group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupBId}`)
    await expectNotFoundPage(page)
    await expect(page.getByRole('link', { name: 'Polaznici' })).toHaveCount(0)
  })

  test('admin bypass: admin can open any teacher group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupBId}`)
    await expect(page.getByRole('link', { name: 'Polaznici' })).toBeVisible()
  })

  // ── I5: Teacher student detail page renders core content ───────────────────

  test('teacher student detail page renders student name, attendance heading, and enrollment info', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)

    const studentFullName = `${STUDENT.firstName} ${STUDENT.lastName}`
    await expect(page.getByRole('heading', { name: studentFullName })).toBeVisible()
    await expect(page.getByText('Evidencija dolaska')).toBeVisible()
    await expect(page.getByText(STUDENT.childSchool)).toBeVisible()
  })
})
