import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 Step 15 — Comments UI (consolidated)
// 10 single-assertion tests merged into 3 flow tests:
//   1. teacher comment-lifecycle (add COMMENT + MODULE_REVIEW + delete own)
//   2. cross-author authz (admin can delete teacher's; teacher cannot delete
//      admin's; teacher B 404 on teacher A's student)
//   3. hard gates (portal leakage + cross-group create rejection)
// Each merged test uses test.step() blocks so the HTML report still pinpoints
// which assertion failed; descriptive `expect(..., 'why')` labels are added.
//
// NOT migrated: the "soft-deleted teacher comment shows 'Bivši nastavnik'
// badge" check from the criteria — the existing 10-test file did not have
// this assertion, so there's nothing to merge. Adding it from scratch would
// be net-new coverage outside this task's scope.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = Date.now().toString().slice(-6)

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
  type: 'COMMENT' | 'MODULE_REVIEW',
) {
  await page.goto(`${BASE}/nastavnik/ucenik/${studentId}`)
  await page.waitForLoadState('domcontentloaded')
  const textarea = page.getByPlaceholder(/Napišite komentar o polazniku|Napišite ocjenu modula/)
  await textarea.waitFor({ state: 'visible', timeout: 30000 })
  if (type === 'MODULE_REVIEW') {
    await page.getByRole('button', { name: 'Ocjena modula' }).click()
    const moduleTrigger = page.getByRole('combobox', { name: /Modul/ })
    if (await moduleTrigger.isVisible()) {
      await moduleTrigger.click()
      await page.getByRole('option').first().click()
    }
  }
  await textarea.fill(content)
  const submit = page.getByRole('button', { name: /Dodaj komentar|Dodaj ocjenu/ })
  await expect(submit).toBeEnabled({ timeout: 10000 })
  await submit.click()
  await expect(page.getByText(/Komentar dodan\.|Ocjena dodana\./)).toBeVisible({ timeout: 30000 })
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

  test('teacher comment lifecycle: add COMMENT + MODULE_REVIEW → admin sees both → filter → delete own', async ({ page }) => {
    test.setTimeout(240000)
    if (!seeded) throw new Error('not seeded')

    await test.step('Teacher A adds both a COMMENT and a MODULE_REVIEW', async () => {
      await loginWithEmail(page, seeded!.teacherA.email, seeded!.teacherA.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await submitStudentComment(page, seeded!.studentId, TEACHER_COMMENT, 'COMMENT')
      await submitStudentComment(page, seeded!.studentId, TEACHER_REVIEW, 'MODULE_REVIEW')
    })

    await test.step('Admin sees both entries on the student detail page', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/ucenici/${seeded!.studentId}`)
      await expect(
        page.getByText(TEACHER_COMMENT),
        'teacher COMMENT is visible to admin',
      ).toBeVisible()
      await expect(
        page.getByText(TEACHER_REVIEW),
        'teacher MODULE_REVIEW is visible to admin',
      ).toBeVisible()
    })

    await test.step('Admin "Ocjene modula" filter hides COMMENT but keeps MODULE_REVIEW; "Sve" restores both', async () => {
      const panelRegion = page
        .getByRole('heading', { name: /Bilješke i recenzije/i })
        .locator('..')
      await panelRegion.getByRole('button', { name: /^Ocjene modula$/ }).click()
      await expect(
        page.getByText(TEACHER_REVIEW),
        'MODULE_REVIEW stays visible under "Ocjene modula"',
      ).toBeVisible()
      await expect(
        page.getByText(TEACHER_COMMENT),
        'plain COMMENT is hidden under "Ocjene modula"',
      ).toHaveCount(0)

      await panelRegion.getByRole('button', { name: /^Sve$/ }).click()
      await expect(
        page.getByText(TEACHER_COMMENT),
        'COMMENT reappears under "Sve"',
      ).toBeVisible()
      await expect(
        page.getByText(TEACHER_REVIEW),
        'MODULE_REVIEW still visible under "Sve"',
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
      await submitStudentComment(page, seeded!.studentId, OWN_DELETE_COMMENT, 'COMMENT')
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
        await page.goto(`${BASE}${path}`)
        const body = (await page.locator('body').innerText()).toLowerCase()
        expect(body, `${path} hides TEACHER_COMMENT`).not.toContain(TEACHER_COMMENT.toLowerCase())
        expect(body, `${path} hides TEACHER_REVIEW`).not.toContain(TEACHER_REVIEW.toLowerCase())
        expect(body, `${path} hides ADMIN_COMMENT`).not.toContain(ADMIN_COMMENT.toLowerCase())
        expect(body, `${path} hides "bilješke i recenzije" heading`).not.toContain(
          'bilješke i recenzije',
        )
        expect(body, `${path} hides "ocjena modula" type label`).not.toContain('ocjena modula')
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
