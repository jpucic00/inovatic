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

import { cleanupRunFixtures } from '../helpers/cleanup'

const RUN_ID = Date.now().toString().slice(-6)

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
  studentLoginEmail: string
  studentPassword: string
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
      studentLoginEmail: `${s.username}@student.inovatic.local`,
      studentPassword: s.password,
    }
    await page.close()
  })

  test('unauthenticated visitor is redirected from /nastavnik', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    expect(page.url()).toContain('/portal')
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

  // ── Back link: the roster is the only way in, so it must be the way out ────

  test('student opened from a roster goes back to that group, not out to the list', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupAId}`)

    // The roster threads the group id onto every student link — that param is
    // the whole mechanism, so assert it before following it.
    const studentFullName = `${STUDENT.firstName} ${STUDENT.lastName}`
    const rosterLink = page.getByRole('link', { name: studentFullName })
    await expect(rosterLink).toHaveAttribute(
      'href',
      `/nastavnik/ucenik/${seeded.studentId}?grupa=${seeded.groupAId}`,
    )
    await rosterLink.click()
    await page.waitForURL(new RegExp(`/nastavnik/ucenik/${seeded.studentId}`), {
      timeout: 30000,
    })

    const back = page.getByRole('link', { name: /^Natrag na / })
    await expect(back).toHaveAttribute('href', `/nastavnik/grupa/${seeded.groupAId}`)
    // Named after the group, so a child in two of this teacher's groups says
    // which one — the generic list label would be the bug this fixed.
    await expect(back).not.toHaveText('Natrag na moje grupe')

    await back.click()
    await page.waitForURL(`${BASE}/nastavnik/grupa/${seeded.groupAId}`, { timeout: 30000 })
    await expect(page.getByRole('heading', { name: seeded.groupACourseTitle })).toBeVisible()
  })

  test('student opened without ?grupa= falls back to the groups list', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)

    const back = page.getByRole('link', { name: 'Natrag na moje grupe' })
    await expect(back).toHaveAttribute('href', '/nastavnik')
  })

  test('a stale ?grupa= costs the back link and nothing else', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    // Teacher B's group: a real id this teacher may not open. The resolver is
    // the non-throwing twin of assertTeacherOwnsGroup — 404-ing a student
    // profile over a query param would be worse than losing the back link.
    await page.goto(
      `${BASE}/nastavnik/ucenik/${seeded.studentId}?grupa=${seeded.groupBId}`,
    )

    const studentFullName = `${STUDENT.firstName} ${STUDENT.lastName}`
    await expect(page.getByRole('heading', { name: studentFullName })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Natrag na moje grupe' })).toBeVisible()
  })

  // ── Payout rate must never reach a teacher- or student-facing payload ──────

  test('hourlyRateCents never appears in the /nastavnik or /portal payloads', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherA.email, seeded.teacherA.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    // One-string canary: the column is admin-only and has exactly one reader.
    // A stray `include` anywhere in these trees ships every scalar with it, and
    // the RSC payload is where that would surface first.
    for (const path of [
      '/nastavnik',
      `/nastavnik/grupa/${seeded.groupAId}`,
      `/nastavnik/ucenik/${seeded.studentId}?grupa=${seeded.groupAId}`,
    ]) {
      await page.goto(`${BASE}${path}`)
      expect(await page.content()).not.toContain('hourlyRateCents')
    }

    // The parent-facing half: this child's only enrollment is group A, so
    // /portal lands straight on its materials.
    await loginWithEmail(page, seeded.studentLoginEmail, seeded.studentPassword)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    expect(await page.content()).not.toContain('hourlyRateCents')
  })
})
