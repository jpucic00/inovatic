import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
  gotoPortalPath,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 Step 15 — Comments UI (consolidated)
// 10 single-assertion tests merged into 3 flow tests:
//   1. teacher comment-lifecycle (add COMMENT + fill the report card + delete own)
//   2. cross-author authz (admin can delete teacher's; teacher cannot delete
//      admin's; teacher B 404 on teacher A's student)
//   3. hard gates (portal leakage + cross-group create rejection)
// 2026-07: MODULE_REVIEW was replaced by the structured StudentAssessment
// report card (Ocjena) — the review branches now drive the AssessmentCard.
// Each merged test uses test.step() blocks so the HTML report still pinpoints
// which assertion failed; descriptive `expect(..., 'why')` labels are added.
//
// NOT migrated: the "soft-deleted teacher comment shows 'Bivši nastavnik'
// badge" check from the criteria — the existing 10-test file did not have
// this assertion, so there's nothing to merge. Adding it from scratch would
// be net-new coverage outside this task's scope.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

const TEACHER_A: TeacherData = {
  firstName: 'Ana',
  lastName: `KomA${RUN_ID}`,
  email: `ana.koma.${RUN_ID}@test.com`,
  phone: '0913330001',
}
const TEACHER_B: TeacherData = {
  firstName: 'Bruno',
  lastName: `KomB${RUN_ID}`,
  email: `bruno.komb.${RUN_ID}@test.com`,
  phone: '0913330002',
}
const STUDENT: StudentData = {
  firstName: 'Tena',
  lastName: `KomKid${RUN_ID}`,
  dateOfBirth: '2016-06-06',
  childSchool: 'OŠ Bilješka',
  parentName: `Roditelj Kom ${RUN_ID}`,
  parentEmail: `kom.kid.${RUN_ID}@test.com`,
  parentPhone: '0916667777',
}

const TEACHER_COMMENT = `Komentar nastavnika ${RUN_ID} — napredak OK.`
const TEACHER_REVIEW = `Recenzija modula ${RUN_ID} — savladano.`
const ADMIN_COMMENT = `Admin bilješka ${RUN_ID} — provjereno.`
const OWN_DELETE_COMMENT = `Vlastita bilješka za brisanje ${RUN_ID}`

type Seeded = {
  teacherA: { email: string; password: string; teacherId: string }
  teacherB: { email: string; password: string }
  groupAId: string
  groupBId: string
  studentId: string
  studentLogin: { email: string; password: string }
}
let seeded: Seeded | null = null

// ─── Spec-specific helpers ──────────────────────────────────────────────────

async function submitStudentComment(
  page: Page,
  studentId: string,
  content: string,
) {
  await page.goto(`${BASE}/nastavnik/ucenik/${studentId}`)
  await page.waitForLoadState('domcontentloaded')
  const textarea = page.getByPlaceholder(/Napišite komentar o polazniku/)
  await textarea.waitFor({ state: 'visible', timeout: 30000 })
  await textarea.fill(content)
  const submit = page.getByRole('button', { name: /Dodaj komentar/ })
  await expect(submit).toBeEnabled({ timeout: 10000 })
  await submit.click()
  await expect(page.getByText('Komentar dodan.')).toBeVisible({ timeout: 30000 })
}

/** Fills the structured report card (Ocjena): first skill → Ostvareno, opisna
 *  ocjena text, then Spremi. The student is enrolled in exactly one standard
 *  group, so exactly one AssessmentCard is on the page. */
async function fillAssessment(page: Page, studentId: string, opisna: string) {
  await page.goto(`${BASE}/nastavnik/ucenik/${studentId}`)
  await page.waitForLoadState('domcontentloaded')
  const opisnaInput = page.getByLabel('Opisna ocjena')
  await opisnaInput.waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: 'Ostvareno' }).first().click()
  await opisnaInput.fill(opisna)
  const save = page.getByRole('button', { name: 'Spremi ocjenu' })
  await expect(save).toBeEnabled({ timeout: 10000 })
  await save.click()
  await expect(page.getByText('Ocjena spremljena.')).toBeVisible({ timeout: 30000 })
}

async function addAdminComment(page: Page, studentId: string, content: string) {
  await page.goto(`${BASE}/admin/ucenici/${studentId}`)
  await page.waitForLoadState('domcontentloaded')
  const form = page
    .locator('form', { has: page.getByRole('button', { name: /Dodaj komentar/ }) })
    .first()
  await form.waitFor({ state: 'visible', timeout: 30000 })
  await form.locator('textarea').fill(content)
  const submit = form.getByRole('button', { name: /Dodaj komentar/ })
  await expect(submit).toBeEnabled({ timeout: 5000 })
  await submit.click()
  await expect(page.getByText('Komentar dodan.')).toBeVisible({ timeout: 30000 })
}

// ─── Test suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 15 — Comments UI', () => {
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh).
    const [groupAId, groupBId] = collectGroupIds(2)
    const tA = await seedTeacher(TEACHER_A)
    const tB = await seedTeacher(TEACHER_B)
    await seedTeacherAssignment(tA.teacherId, groupAId)
    await seedTeacherAssignment(tB.teacherId, groupBId)

    const s = await seedStudentInGroup(groupAId, STUDENT)

    seeded = {
      teacherA: { email: TEACHER_A.email, password: tA.password, teacherId: tA.teacherId },
      teacherB: { email: TEACHER_B.email, password: tB.password },
      groupAId,
      groupBId,
      studentId: s.studentId,
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
    }
  })

  test('teacher comment lifecycle: add COMMENT + report card → admin sees both → delete own', async ({ page }) => {
    test.setTimeout(240000)
    if (!seeded) throw new Error('not seeded')

    await test.step('Teacher A adds a COMMENT and fills the report card', async () => {
      await loginWithEmail(page, seeded!.teacherA.email, seeded!.teacherA.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await submitStudentComment(page, seeded!.studentId, TEACHER_COMMENT)
      await fillAssessment(page, seeded!.studentId, TEACHER_REVIEW)
    })

    await test.step('Admin sees the comment and the saved report card', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici/${seeded!.studentId}`)
      await expect(
        page.getByText(TEACHER_COMMENT),
        'teacher COMMENT is visible to admin',
      ).toBeVisible()
      await expect(
        page.getByLabel('Opisna ocjena').first(),
        'opisna ocjena persisted and is visible to admin',
      ).toHaveValue(TEACHER_REVIEW)
      await expect(
        page.getByRole('button', { name: 'Ostvareno' }).first(),
        'saved skill level renders as pressed',
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(
        page.getByText(/Spremljeno/).first(),
        'card footer shows the saved-at line with the author',
      ).toBeVisible()
    })

    await test.step('School-year tab matches the seeded enrollment year', async () => {
      const year = new Date().getMonth() >= 8
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1
      const expectedSchoolYear = `${year}/${year + 1}`
      await expect(
        page.getByText(expectedSchoolYear).first(),
        'school-year tab is rendered with the expected year string',
      ).toBeVisible()
    })

    await test.step('Teacher creates a throwaway comment and deletes it', async () => {
      await loginWithEmail(page, seeded!.teacherA.email, seeded!.teacherA.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await submitStudentComment(page, seeded!.studentId, OWN_DELETE_COMMENT)
      await expect(
        page.getByText(OWN_DELETE_COMMENT),
        'own comment is visible before delete',
      ).toBeVisible()

      page.once('dialog', (d) => d.accept())
      const article = page.locator('article', { hasText: OWN_DELETE_COMMENT })
      await article.getByRole('button', { name: 'Izbriši bilješku' }).click()
      await expect(
        page.getByText('Bilješka izbrisana.'),
        'delete confirmation toast appears',
      ).toBeVisible({ timeout: 10000 })
      await expect(
        page.getByText(OWN_DELETE_COMMENT),
        'own comment is gone after delete',
      ).toHaveCount(0)
    })
  })

  test('cross-author authz: admin can delete, teacher cannot delete admin\'s, teacher B 404s', async ({ page }) => {
    test.setTimeout(240000)
    if (!seeded) throw new Error('not seeded')

    await test.step('Admin creates ADMIN_COMMENT and can delete it', async () => {
      await loginAsAdmin(page)
      await addAdminComment(page, seeded!.studentId, ADMIN_COMMENT)
      await expect(
        page.getByText(ADMIN_COMMENT),
        'admin comment is visible after creation',
      ).toBeVisible()

      page.once('dialog', (d) => d.accept())
      const articles = page.locator('article', { hasText: ADMIN_COMMENT })
      await articles.first().getByRole('button', { name: 'Izbriši bilješku' }).click()
      await expect(
        page.getByText('Bilješka izbrisana.'),
        'admin-delete toast confirms server action ran',
      ).toBeVisible({ timeout: 15000 })
      await expect(
        page.getByText(ADMIN_COMMENT),
        'admin-deleted comment is gone',
      ).toHaveCount(0)
    })

    await test.step('Admin re-creates ADMIN_COMMENT; teacher A sees it but has no delete affordance', async () => {
      await addAdminComment(page, seeded!.studentId, ADMIN_COMMENT)

      await loginWithEmail(page, seeded!.teacherA.email, seeded!.teacherA.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/ucenik/${seeded!.studentId}`)

      const adminArticle = page.locator('article', { hasText: ADMIN_COMMENT })
      await expect(
        adminArticle,
        'teacher A can READ the admin comment',
      ).toBeVisible()
      await expect(
        adminArticle.getByRole('button', { name: 'Izbriši bilješku' }),
        'teacher A has NO delete button on the admin comment',
      ).toHaveCount(0)

      const teacherArticle = page.locator('article', { hasText: TEACHER_COMMENT })
      await expect(
        teacherArticle,
        'teacher A still sees their own original COMMENT',
      ).toBeVisible()
      await expect(
        teacherArticle.getByRole('button', { name: 'Izbriši bilješku' }),
        'teacher A DOES have a delete button on their own comment',
      ).toHaveCount(1)
    })

    await test.step('Teacher B 404s on teacher A\'s student (server-action delete rejection covered by the route guard)', async () => {
      await loginWithEmail(page, seeded!.teacherB.email, seeded!.teacherB.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/ucenik/${seeded!.studentId}`)
      await expectNotFoundPage(page)
      await expect(
        page.getByRole('button', { name: /Dodaj komentar/ }),
        'teacher B has no add-comment form (page is 404)',
      ).toHaveCount(0)
      await expect(
        page.getByText(TEACHER_COMMENT),
        'teacher B cannot READ teacher A\'s comments either',
      ).toHaveCount(0)
      await expect(
        page.getByText(ADMIN_COMMENT),
        'teacher B cannot READ admin\'s comments on teacher A\'s student',
      ).toHaveCount(0)
    })
  })

  test('hard gates: student portal hides all comment content + teacher B cannot create for non-group student', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')

    await test.step('Student portal pages show no seeded comment content', async () => {
      await loginWithEmail(page, seeded!.studentLogin.email, seeded!.studentLogin.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })

      for (const path of ['/portal', `/portal/grupa/${seeded!.groupAId}`, '/portal/profil']) {
        await gotoPortalPath(page, path)
        const body = (await page.locator('body').innerText()).toLowerCase()
        expect(body, `${path} hides TEACHER_COMMENT`).not.toContain(TEACHER_COMMENT.toLowerCase())
        expect(body, `${path} hides TEACHER_REVIEW`).not.toContain(TEACHER_REVIEW.toLowerCase())
        expect(body, `${path} hides ADMIN_COMMENT`).not.toContain(ADMIN_COMMENT.toLowerCase())
        expect(body, `${path} hides the report-card "opisna ocjena" label`).not.toContain(
          'opisna ocjena',
        )
        expect(body, `${path} hides the report-card "preporuka" label`).not.toContain('preporuka')
      }
    })

    await test.step('Teacher B cannot reach the add-comment form for teacher A\'s student', async () => {
      await loginWithEmail(page, seeded!.teacherB.email, seeded!.teacherB.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/ucenik/${seeded!.studentId}`)
      await expectNotFoundPage(page)
      await expect(
        page.getByPlaceholder(/Napišite komentar o polazniku/),
        'add-comment textarea is not rendered on the 404 page',
      ).toHaveCount(0)
    })
  })
})
