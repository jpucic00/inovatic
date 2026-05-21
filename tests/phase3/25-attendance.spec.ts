import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  markSession,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'

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
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh) — drops the admin UI clicks.
    const [groupId, otherGroupId] = collectGroupIds(2)
    const t = await seedTeacher(TEACHER)
    const ot = await seedTeacher(OTHER_TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)
    await seedTeacherAssignment(ot.teacherId, otherGroupId)

    const s = await seedStudentInGroup(groupId, STUDENT)
    await seedStudentInGroup(otherGroupId, OTHER_STUDENT)

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
  })

  // Mark + re-mark lifecycle merge (was 2 tests). Each original `expect()`
  // is preserved as its own `test.step()` with descriptive labels.
  test('attendance: mark session → admin sees → re-mark with note → no duplicates + note persists', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(180000)

    await test.step('Teacher marks 17.03.2026 session', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await markSession(page, seeded!.groupId, SESSION_DATE)
    })

    await test.step('Admin sees the entry on the student attendance panel (Prisutan)', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici/${seeded!.studentId}`)
      await expect(
        page.getByRole('heading', { name: 'Evidencija dolaska' }),
        'admin attendance panel heading is visible',
      ).toBeVisible()
      const croDateRegex = /17\.\s?03\.\s?2026\./
      const attendanceSection = page
        .locator('div')
        .filter({ has: page.getByRole('heading', { name: 'Evidencija dolaska' }) })
        .first()
      await expect(
        attendanceSection.getByText(croDateRegex).first(),
        'session date "17.03.2026." is rendered',
      ).toBeVisible()
      await expect(
        attendanceSection.getByText('Prisutan').first(),
        'initial mark renders as "Prisutan"',
      ).toBeVisible()
    })

    await test.step('Teacher re-marks the same session as Odsutan with a note', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/dolazak`)

      const dateButton = page.getByRole('button', { name: /17\.\s?03\.\s?2026\./ })
      await dateButton.first().click()

      const studentFullName = `${STUDENT.lastName} ${STUDENT.firstName}`
      const row = page.locator('tr', { hasText: studentFullName })
      await row.getByRole('button', { name: 'Prisutan' }).click()
      await expect(
        row.getByRole('button', { name: 'Odsutan' }),
        'row flips to "Odsutan" after re-mark click',
      ).toBeVisible()
      await row.locator('input[type="text"]').fill(RE_MARK_NOTE)

      await page.getByRole('button', { name: 'Spremi' }).click()
      await expect(
        page.getByText('Evidencija spremljena.'),
        'save toast confirms server upsert ran',
      ).toBeVisible({ timeout: 10000 })
    })

    await test.step('Admin sees updated row: no duplicate, status=Odsutan, note persisted', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici/${seeded!.studentId}`)
      const croDateRegex = /17\.\s?03\.\s?2026\./
      const dateCells = page.locator('td').filter({ hasText: croDateRegex })
      await expect(
        dateCells,
        're-marking upserted — only ONE row for that session date',
      ).toHaveCount(1)

      const rowInAdmin = page.locator('tr').filter({ hasText: croDateRegex })
      await expect(
        rowInAdmin.getByText('Odsutan'),
        'admin sees updated status "Odsutan"',
      ).toBeVisible()
      await expect(
        rowInAdmin.getByText(RE_MARK_NOTE),
        'admin sees persisted note',
      ).toBeVisible()
    })
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

  // The roster-scope-by-group assertion (previously test 5) moved out of this
  // file: the date-computation arithmetic it exercised is now covered by
  // tests/unit/lib/session-dates.test.ts, and the (Enrollment ↔ group)
  // join-scoping behaviour is covered by teacher-guard tests in
  // tests/phase3/22-teacher-panel.spec.ts.
})
