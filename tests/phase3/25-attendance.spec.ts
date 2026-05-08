import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  markSession,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Ana',
  lastName: `DolNast${RUN_ID}`,
  email: `ana.dolnast.${RUN_ID}@test.com`,
  phone: '0912220001',
}
const OTHER_TEACHER: TeacherData = {
  firstName: 'Bruno',
  lastName: `DolOther${RUN_ID}`,
  email: `bruno.dolother.${RUN_ID}@test.com`,
  phone: '0912220002',
}
const STUDENT: StudentData = {
  firstName: 'Pavla',
  lastName: `DolKid${RUN_ID}`,
  dateOfBirth: '2016-05-05',
  childSchool: 'OŠ Dolazak',
  parentName: `Roditelj Dol ${RUN_ID}`,
  parentEmail: `dol.kid.${RUN_ID}@test.com`,
  parentPhone: '0911117777',
}

const OTHER_STUDENT: StudentData = {
  firstName: 'Mia',
  lastName: `DolOtherKid${RUN_ID}`,
  dateOfBirth: '2016-06-06',
  childSchool: 'OŠ Dolazak 2',
  parentName: `Roditelj DolOther ${RUN_ID}`,
  parentEmail: `dolother.kid.${RUN_ID}@test.com`,
  parentPhone: '0911117778',
}

const SESSION_DATE = '2026-03-17'
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

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 14 — Attendance', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupId, otherGroupId] = collectGroupIds(page, 2)
    const t = await createTeacher(page, TEACHER)
    const ot = await createTeacher(page, OTHER_TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    await assignTeacherToGroup(page, ot.teacherId, otherGroupId)

    const s = await createStudentInGroup(page, groupId, STUDENT)
    await createStudentInGroup(page, otherGroupId, OTHER_STUDENT)

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
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await markSession(page, seeded.groupId, SESSION_DATE)

    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    await expect(page.getByRole('heading', { name: 'Evidencija dolaska' })).toBeVisible()

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
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)

    const dateButton = page.getByRole('button', {
      name: /17\.\s?03\.\s?2026\./,
    })
    await dateButton.first().click()

    const studentFullName = `${STUDENT.lastName} ${STUDENT.firstName}`
    const row = page.locator('tr', { hasText: studentFullName })
    await row.getByRole('button', { name: 'Prisutan' }).click()
    await expect(row.getByRole('button', { name: 'Odsutan' })).toBeVisible()
    await row.locator('input[type="text"]').fill(RE_MARK_NOTE)

    await page.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 10000 })

    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    const croDateRegex = /17\.\s?03\.\s?2026\./
    const dateCells = page.locator('td').filter({ hasText: croDateRegex })
    await expect(dateCells).toHaveCount(1)

    const rowInAdmin = page.locator('tr').filter({ hasText: croDateRegex })
    await expect(rowInAdmin.getByText('Odsutan')).toBeVisible()
    await expect(rowInAdmin.getByText(RE_MARK_NOTE)).toBeVisible()
  })

  test('teacher cannot view attendance for another teacher\'s group (404)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.otherGroupId}/dolazak`)
    await expectNotFoundPage(page)
    await expect(page.getByRole('button', { name: 'Spremi' })).toHaveCount(0)
  })

  test('student portal contains no attendance text (leakage guard)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    for (const path of ['/portal', `/portal/grupa/${seeded.groupId}`, '/portal/profil']) {
      await page.goto(`${BASE}${path}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain('evidencija dolaska')
      expect(body).not.toContain('odsutan')
      expect(body).not.toContain(RE_MARK_NOTE.toLowerCase())
    }
  })

  // ── C5: attendance roster only shows students from the teacher's own group ──

  test('attendance roster only includes students from the teacher\'s own group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)
    await page.waitForLoadState('domcontentloaded')

    const ownStudentName = `${STUDENT.lastName} ${STUDENT.firstName}`
    await expect(page.getByText(ownStudentName)).toBeVisible({ timeout: 10000 })

    const otherStudentName = `${OTHER_STUDENT.lastName} ${OTHER_STUDENT.firstName}`
    await expect(page.getByText(otherStudentName)).toHaveCount(0)
  })
})
