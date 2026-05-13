import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  addLinkMaterial,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Soft-delete teachers — verifies the four observable ACs from Flux z4287i3:
// 1) deleteTeacher succeeds on teachers with prior materials/comments (was
//    failing with FK constraint before this change).
// 2) Login rejects soft-deleted teachers.
// 3) Teacher disappears from admin /admin/nastavnici listing.
// 4) Historical content (material, comment) still renders the author's name
//    with a "Bivši nastavnik" badge in admin views.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Doris',
  lastName: `Soft${RUN_ID}`,
  email: `doris.soft.${RUN_ID}@test.com`,
  phone: '0913330099',
}

const STUDENT: StudentData = {
  firstName: 'Mia',
  lastName: `SoftKid${RUN_ID}`,
  dateOfBirth: '2015-04-04',
  childSchool: 'OŠ Soft',
  parentName: `Roditelj Soft ${RUN_ID}`,
  parentEmail: `soft.kid.${RUN_ID}@test.com`,
  parentPhone: '0916660099',
}

const MATERIAL_TITLE = `Soft-delete materijal ${RUN_ID}`
const COMMENT_TEXT = `Soft-delete komentar ${RUN_ID} — provjera povijesti.`

type Seeded = {
  teacher: { email: string; password: string; teacherId: string; fullName: string }
  groupId: string
  studentId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Soft-delete teachers (z4287i3)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const [groupId] = collectGroupIds(page, 1)
    const t = await createTeacher(page, TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    const s = await createStudentInGroup(page, groupId, STUDENT)

    seeded = {
      teacher: {
        email: TEACHER.email,
        password: t.password,
        teacherId: t.teacherId,
        fullName: `${TEACHER.firstName} ${TEACHER.lastName}`,
      },
      groupId,
      studentId: s.studentId,
    }
    await page.close()
  })

  test('teacher authors a material and a comment before deletion', async ({ page }) => {
    test.setTimeout(180000)
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)
    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      MATERIAL_TITLE,
      'https://example.com/soft-delete',
    )

    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.studentId}`)
    await page.waitForLoadState('domcontentloaded')
    const textarea = page.getByPlaceholder(/Napišite komentar o polazniku|Napišite ocjenu modula/)
    await textarea.waitFor({ state: 'visible', timeout: 30000 })
    await textarea.fill(COMMENT_TEXT)
    const submit = page.getByRole('button', { name: /Dodaj komentar/ })
    await expect(submit).toBeEnabled({ timeout: 10000 })
    await submit.click()
    await expect(page.getByText('Komentar dodan.')).toBeVisible({ timeout: 30000 })
  })

  test('admin can soft-delete teacher even with prior material + comment', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici/${seeded.teacher.teacherId}`)

    await page.getByRole('button', { name: 'Obriši nastavnika' }).click()
    await page.getByRole('button', { name: 'Obriši trajno' }).click()

    // Redirects back to the teacher list — confirms the action succeeded
    // (previously this raised a FK constraint and stayed on the detail page).
    await page.waitForURL(`${BASE}/admin/nastavnici`, { timeout: 15000 })
  })

  test('soft-deleted teacher disappears from admin teacher list', async ({ page }) => {
    test.setTimeout(60000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici?search=${TEACHER.lastName}`)
    await expect(page.getByText('Nema nastavnika koji odgovaraju pretrazi.')).toBeVisible()
  })

  test('soft-deleted teacher cannot log in', async ({ page }) => {
    test.setTimeout(60000)
    if (!seeded) throw new Error('not seeded')
    await page.goto(`${BASE}/prijava`)
    await page.locator('#identifier').fill(seeded.teacher.email)
    await page.locator('input[type="password"]').fill(seeded.teacher.password)
    await page.locator('button[type="submit"]').click()

    // Stay on /prijava — same path the generic "wrong credentials" flow uses.
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/prijava/, { timeout: 15000 })
  })

  test('historical comment still renders author name + "Bivši nastavnik" badge for admin', async ({ page }) => {
    test.setTimeout(60000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    await page.waitForLoadState('domcontentloaded')

    // Author name still resolves on the historical comment.
    await expect(page.getByText(COMMENT_TEXT)).toBeVisible()
    await expect(page.getByText(seeded.teacher.fullName).first()).toBeVisible()

    // At least one "Bivši nastavnik" badge appears on the page (the comment
    // we authored above is the only soft-deleted author surface here).
    await expect(page.getByText('Bivši nastavnik').first()).toBeVisible()
  })
})
