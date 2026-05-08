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
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Dino',
  lastName: `MatNast${RUN_ID}`,
  email: `dino.matnast.${RUN_ID}@test.com`,
  phone: '0919111111',
}
const STUDENT: StudentData = {
  firstName: 'Iva',
  lastName: `MatKid${RUN_ID}`,
  dateOfBirth: '2016-07-07',
  childSchool: 'OŠ Mat',
  parentName: `Roditelj Mat ${RUN_ID}`,
  parentEmail: `mat.kid.${RUN_ID}@test.com`,
  parentPhone: '0911110001',
}

const GROUP_LINK_TITLE = `Grupni LINK ${RUN_ID}`
const MODULE_LINK_TITLE = `Modulni LINK ${RUN_ID}`
type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  student: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 13 — Materials', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const groupId = pickStandardGroupId(page)
    const t = await createTeacher(page, TEACHER)
    await assignTeacherToGroup(page, t.teacherId, groupId)
    const s = await createStudentInGroup(page, groupId, STUDENT)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      student: { email: `${s.username}@student.inovatic.local`, password: s.password },
      groupId,
    }
    await page.close()
  })

  test('teacher navbar has a "Materijali" link', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await expect(page.getByRole('link', { name: 'Materijali' }).first()).toBeVisible()
  })

  test('teacher creates a GROUP LINK material and student sees it', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      GROUP_LINK_TITLE,
      'https://drive.google.com/file/d/abc123',
    )
    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
  })

  test('teacher creates a MODULE LINK material and student sees it in the group', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    await addLinkMaterial(
      page,
      /Dodaj u modul:/,
      MODULE_LINK_TITLE,
      'https://example.com/module-resource',
    )
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  test('student portal renders both GROUP and MODULE materials', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)

    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  test('teacher hides the MODULE material in this group — student no longer sees it', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const row = page.locator('li', { has: page.getByText(MODULE_LINK_TITLE) })
    await row.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
    await expect(row.getByText('Sakriveno u grupi')).toBeVisible({ timeout: 5000 })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toHaveCount(0)
    await expect(page.getByText(GROUP_LINK_TITLE)).toBeVisible()
  })

  // ── I2: Unhide (re-show) MODULE material ──────────────────────────────────

  test('teacher unhides the MODULE material — student sees it again', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const row = page.locator('li', { has: page.getByText(MODULE_LINK_TITLE) })
    await row.getByRole('button', { name: 'Prikaži u ovoj grupi' }).click()
    await expect(row.getByText('Sakriveno u grupi')).toHaveCount(0, { timeout: 5000 })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  test('teacher deletes the GROUP material — student loses it too', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    page.on('dialog', (d) => d.accept())

    const row = page.locator('li', { has: page.getByText(GROUP_LINK_TITLE) })
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)
    await expect(page.getByText(GROUP_LINK_TITLE)).toHaveCount(0)
  })

  test('/api/upload/materials rejects a STUDENT cookie', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['hi'], { type: 'text/plain' }), 'hi.txt')
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
  })

  test('/api/upload/materials rejects an unsupported MIME', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append(
        'file',
        new Blob(['x'], { type: 'application/x-custom-unsupported' }),
        'weird.bin',
      )
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  test('admin materials page lists existing materials with search + filters', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/materijali?q=${encodeURIComponent(MODULE_LINK_TITLE)}`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  // ── I6: Teacher "Moji materijali" page ─────────────────────────────────────

  test('teacher /nastavnik/materijali page lists materials from assigned groups', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/materijali`)
    await expect(page.getByText(MODULE_LINK_TITLE)).toBeVisible()
  })

  // ── I7: setMaterialHidden rejects GROUP scope ──────────────────────────────

  test('hide toggle is not offered for GROUP-scope materials', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // Re-create a GROUP material for this test
    await addLinkMaterial(
      page,
      /Dodaj samo u ovu grupu/,
      `GROUP-hide-test ${RUN_ID}`,
      'https://example.com/hide-test',
    )

    const row = page.locator('li', { has: page.getByText(`GROUP-hide-test ${RUN_ID}`) })
    await expect(row).toBeVisible()
    // GROUP materials should not have a hide toggle
    await expect(row.getByRole('button', { name: /Sakrij u ovoj grupi/ })).toHaveCount(0)

    // Clean up
    page.on('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })
  })
})
