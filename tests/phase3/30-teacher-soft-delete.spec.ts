import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  addLinkMaterial,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Soft-delete teachers — DOM-dependent slice only (Flux a69o3ew slim).
// The headless ACs (deletedAt write succeeds, query-filter hides soft-deleted
// teacher, auth.authorize rejects soft-deleted login) live at
// tests/integration/api/teacher-soft-delete.test.ts. This file keeps the two
// tests that require a real browser:
//   1. UI flow that produces the pre-deletion fixtures
//   2. "Bivši nastavnik" badge rendering on historical comment in admin view
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

test.describe('Soft-delete teachers — DOM-dependent', () => {
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh).
    const [groupId] = collectGroupIds(1)
    const t = await seedTeacher(TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)
    const s = await seedStudentInGroup(groupId, STUDENT)

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
  })

  // Test 1 — UI flow that produces the historical material + comment so the
  // badge-rendering test below has something to assert against. Also smoke-
  // tests the teacher's add-material + add-comment UI as a side effect.
  test('teacher authors a material and a comment via UI; admin then soft-deletes', async ({
    page,
  }) => {
    test.setTimeout(240000)
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

    // Admin soft-deletes (the deletedAt-write and FK-survival assertions are
    // covered by tests/integration/api/teacher-soft-delete.test.ts).
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/nastavnici/${seeded.teacher.teacherId}`)
    await page.getByRole('button', { name: 'Obriši nastavnika' }).click()
    await page.getByRole('button', { name: 'Obriši trajno' }).click()
    await page.waitForURL(`${BASE}/admin/nastavnici`, { timeout: 15000 })
  })

  // Test 2 — Historical content surfaces with the soft-deleted-author badge.
  test('historical comment renders author name + "Bivši nastavnik" badge for admin', async ({
    page,
  }) => {
    test.setTimeout(60000)
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.studentId}`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText(COMMENT_TEXT)).toBeVisible()
    await expect(page.getByText(seeded.teacher.fullName).first()).toBeVisible()
    await expect(page.getByText('Bivši nastavnik').first()).toBeVisible()
  })
})
