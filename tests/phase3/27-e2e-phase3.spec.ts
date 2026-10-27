import { test, expect } from '@playwright/test'
import {
  BASE,
  gotoPortalPath,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  addGroupLinkMaterial,
  lessonAudienceSection,
  materialCard,
  groupLessonTarget,
  openLesson,
  pinLessonToCurrentSat,
  seedLesson,
  croatianDateRegex,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'

const RUN_ID = newRunId()

// Teardown: every fixture this spec creates carries RUN_ID in its name, e-mail or
// title, so one call removes exactly this run's rows and can reach no other.
// Without it each run's groups stay for good, and `/admin/grupe` packs a
// weekday's groups into one lane — past a few dozen leftovers the entries go
// zero-width and specs that never changed start failing on the litter.
// Best-effort by design: it swallows, so a teardown problem can never turn a
// green run red.
// A parent sees only the current lesson, so the spec's lesson is pinned to the
// group's current sat; this puts back whatever lesson held that sat before.
let restoreCurrentSat: (() => Promise<void>) | null = null

test.afterAll(async () => {
  await restoreCurrentSat?.()
  await cleanupRunFixtures(RUN_ID)
})

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

const LESSON_TITLE = `E2E lekcija ${RUN_ID}`
const COURSE_MATERIAL = `E2E program material ${RUN_ID}`
const GROUP_MATERIAL = `E2E grupa material ${RUN_ID}`
const REVIEW_TEXT = `E2E recenzija ${RUN_ID} — odličan napredak.`
// Today, on the Zagreb calendar — NOT a fixed date. A teacher may only record
// the current calendar month up to today (`teacherMarkingWindow`), and an
// out-of-window date still renders its heading while Save is replaced by the
// reason. A hardcoded date therefore does not fail when it rots, it fails a
// month later as a missing "Spremi" button, which reads like a broken form
// rather than a stale fixture. `en-CA` is the locale that formats as YYYY-MM-DD.
const SESSION_DATE = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })

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
    // Program curriculum is admin-owned: a lesson on the module this group is
    // on today, holding one kids' link, so the teacher flow can hide it and the
    // student can see/lose it. Seeded directly — the lesson editor itself is
    // covered by 24-materials.
    const { lessonId } = await seedLesson({
      target: await groupLessonTarget(groupId),
      title: LESSON_TITLE,
      studentLinks: [{ title: COURSE_MATERIAL, url: 'https://example.com/e2e/program' }],
    })
    restoreCurrentSat = await pinLessonToCurrentSat(groupId, lessonId)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      studentId: s.studentId,
      studentLogin: {
        email: s.loginEmail,
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
    // Teacher may only add GROUP materials, into an existing lesson; the
    // curriculum material was seeded in beforeAll and appears here read-only.
    await addGroupLinkMaterial(page, LESSON_TITLE, 'STUDENT', {
      title: GROUP_MATERIAL,
      url: 'https://example.com/e2e/group',
    })
    const lesson = await openLesson(page, LESSON_TITLE)
    await expect(lesson.getByText(COURSE_MATERIAL)).toBeVisible()
    await expect(lesson.getByText(GROUP_MATERIAL)).toBeVisible()

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/dolazak`)
    const dateInput = page.locator('input[type="date"]')
    await dateInput.waitFor({ state: 'visible', timeout: 20000 })
    const addBtn = page.getByRole('button', { name: 'Dodaj' })
    // Re-fill until React reflects it — a fill that lands before hydration is
    // swallowed when the controlled input re-renders empty. Same loop as
    // markSession in tests/helpers/phase3.ts.
    await expect(async () => {
      await dateInput.fill(SESSION_DATE)
      await dateInput.evaluate((el) =>
        el.dispatchEvent(new Event('input', { bubbles: true })),
      )
      await expect(addBtn).toBeEnabled({ timeout: 1500 })
    }).toPass({ timeout: 20000 })
    await addBtn.click()
    // Wait for React to commit setSelected(SESSION_DATE) before Spremi reads it;
    // see markSession in tests/helpers/phase3.ts for the same workaround.
    await expect(
      page.getByRole('heading', { level: 3, name: croatianDateRegex(SESSION_DATE) }),
    ).toBeVisible({ timeout: 5000 })
    // Checkboxes start blank; nothing is present until the teacher says so.
    await page.getByRole('checkbox', { name: 'Označi sve prisutne' }).click()
    await page.getByRole('button', { name: 'Spremi evidenciju' }).click()
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
    // Derived from SESSION_DATE, not written out again — a second literal copy
    // of the same date is what silently outlived the first one.
    await expect(page.getByText(croatianDateRegex(SESSION_DATE)).first()).toBeVisible()
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

    // One enrollment: /portal forwards to the group, whose lessons are an
    // accordion — open this one rather than relying on which starts open.
    await page.waitForURL(new RegExp(`/portal/grupa/${seeded.groupId}`), { timeout: 30000 })
    const lesson = await openLesson(page, LESSON_TITLE)
    await expect(lesson.getByText(COURSE_MATERIAL)).toBeVisible()
    await expect(lesson.getByText(GROUP_MATERIAL)).toBeVisible()

    for (const path of ['/portal', `/portal/grupa/${seeded.groupId}`, '/portal/profil']) {
      // Portal-path walks hit the App Router prefetch race (ERR_ABORTED);
      // gotoPortalPath absorbs it — same as specs 25/26/31.
      await gotoPortalPath(page, path)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain(REVIEW_TEXT.toLowerCase())
      expect(body).not.toContain('evidencija dolaska')
      expect(body).not.toContain('odsutan')
      expect(body).not.toContain('opisna ocjena')
      expect(body).not.toContain('preporuka')
    }
  })

  // Hiding a curriculum material in one group has no UI any more (owner,
  // 2026-10-10): the group's own material is what a teacher takes back.
  test('teacher deletes the GROUP material → student loses it (curriculum material stays)', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const staffLesson = await openLesson(page, LESSON_TITLE)
    const kids = lessonAudienceSection(page, staffLesson, 'STUDENT')
    // No delete control on the curriculum card — it belongs to the program page.
    await expect(materialCard(kids, COURSE_MATERIAL)).toBeVisible()
    await expect(materialCard(kids, COURSE_MATERIAL).getByRole('button', { name: 'Obriši materijal' })).toHaveCount(0)

    const card = materialCard(kids, GROUP_MATERIAL)
    page.once('dialog', (d) => d.accept())
    await card.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(card).toBeHidden({ timeout: 10000 })

    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await gotoPortalPath(page, `/portal/grupa/${seeded.groupId}`)
    const lesson = await openLesson(page, LESSON_TITLE)
    await expect(lesson.getByText(COURSE_MATERIAL)).toBeVisible()
    await expect(page.getByText(GROUP_MATERIAL)).toHaveCount(0)
  })
})
