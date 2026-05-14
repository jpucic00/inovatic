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

  // ── I8: updateMaterial happy path with Cloudinary cleanup of old asset ────

  test('teacher replaces a material file — old Cloudinary asset is destroyed', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)

    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    const TITLE = `Replace File Test ${RUN_ID}`

    // ── 1. Create the material with an initial DOCUMENT (text/plain) file ─────
    await page.getByRole('button', { name: /Dodaj samo u ovu grupu/ }).first().click()
    const addDialog = page.locator('[role="dialog"]')
    await addDialog.locator('#material-title').fill(TITLE)

    const addFileInput = addDialog.locator('input[type="file"]')
    await addFileInput.waitFor({ state: 'attached', timeout: 5000 })
    // React-hydration wait — same pattern as the gallery spec, otherwise
    // setInputFiles can fire before React attaches its onChange.
    await addFileInput.evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          const check = () => {
            if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
            else setTimeout(check, 50)
          }
          check()
        }),
    )

    const firstUploadDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/upload/materials') &&
        resp.request().method() === 'POST',
      { timeout: 60000 },
    )
    await addFileInput.setInputFiles({
      name: 'first.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('first content for updateMaterial cleanup test'),
    })
    await addFileInput.evaluate((el) =>
      el.dispatchEvent(new Event('change', { bubbles: true })),
    )
    const firstResp = await firstUploadDone
    expect(firstResp.status(), 'initial upload route returned non-200').toBe(200)
    const firstJson = (await firstResp.json()) as { url: string }
    const originalFileUrl = firstJson.url
    expect(originalFileUrl).toContain('res.cloudinary.com')

    await addDialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(addDialog).toBeHidden({ timeout: 15000 })
    await expect(page.getByText(TITLE)).toBeVisible({ timeout: 15000 })

    // ── 2. Open Edit dialog and upload a replacement file ─────────────────────
    const row = page.locator('li', { has: page.getByText(TITLE) })
    await row.getByRole('button', { name: 'Uredi materijal' }).click()
    const editDialog = page.locator('[role="dialog"]')
    await expect(editDialog.getByText('Zamijeni datoteku')).toBeVisible({ timeout: 5000 })

    const editFileInput = editDialog.locator('#edit-material-file')
    await editFileInput.waitFor({ state: 'attached', timeout: 5000 })
    await editFileInput.evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          const check = () => {
            if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
            else setTimeout(check, 50)
          }
          check()
        }),
    )

    const secondUploadDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/upload/materials') &&
        resp.request().method() === 'POST',
      { timeout: 60000 },
    )
    await editFileInput.setInputFiles({
      name: 'second.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('second content — replacement file for cleanup test'),
    })
    await editFileInput.evaluate((el) =>
      el.dispatchEvent(new Event('change', { bubbles: true })),
    )
    const secondResp = await secondUploadDone
    expect(secondResp.status(), 'replacement upload route returned non-200').toBe(200)
    const secondJson = (await secondResp.json()) as { url: string }
    const newFileUrl = secondJson.url
    expect(newFileUrl).toContain('res.cloudinary.com')
    expect(newFileUrl, 'replacement URL must differ from original').not.toBe(originalFileUrl)

    await editDialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(editDialog).toBeHidden({ timeout: 15000 })

    // ── 3. Old Cloudinary asset must be gone (best-effort destroy is async,
    //       so we poll). New asset must still be reachable. ───────────────────
    await expect
      .poll(
        async () => (await page.request.head(originalFileUrl)).status(),
        { timeout: 30000, intervals: [1000, 2000, 3000, 5000] },
      )
      .not.toBe(200)

    const newStatus = (await page.request.head(newFileUrl)).status()
    expect(newStatus, 'replacement asset must still be reachable').toBe(200)

    // ── 4. Cleanup: delete the material so the replacement asset doesn't leak
    page.on('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })
  })
})
