import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)
const SAMPLE_PNG = path.resolve(__dirname, '../fixtures/sample.png')

const TEACHER: TeacherData = {
  firstName: 'Goran',
  lastName: `GalNast${RUN_ID}`,
  email: `goran.galnast.${RUN_ID}@test.com`,
  phone: '0919112233',
}
const STUDENT: StudentData = {
  firstName: 'Maja',
  lastName: `GalKid${RUN_ID}`,
  dateOfBirth: '2016-08-08',
  childSchool: 'OŠ Galerija',
  parentName: `Roditelj Gal ${RUN_ID}`,
  parentEmail: `gal.kid.${RUN_ID}@test.com`,
  parentPhone: '0911110002',
}

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  student: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — Gallery', () => {
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

  test('teacher group page surfaces a Galerija tab', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}`)
    await expect(page.getByRole('link', { name: 'Galerija' })).toBeVisible()
  })

  test('teacher uploads a PNG via the gallery upload zone — appears on student portal', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/galerija`)

    const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 5000 })
    await fileInput.setInputFiles(SAMPLE_PNG)

    await expect(
      page.locator('button[aria-label="Otvori sliku"]').first(),
    ).toBeVisible({ timeout: 30000 })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.waitForLoadState('domcontentloaded')
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}/galerija`)
    await expect(
      page.locator('button[aria-label="Otvori sliku"]').first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button[aria-label="Obriši sliku"]')).toHaveCount(0)
  })

  test('teacher in a different group → 404 on /nastavnik/grupa/<unknown>/galerija', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/does-not-exist-${RUN_ID}/galerija`)
    await expectNotFoundPage(page)
    await expect(page.getByRole('button', { name: /Dodaj slik|Upload/ })).toHaveCount(0)
  })

  test('student NOT enrolled → 404 on /portal/grupa/<unknown>/galerija', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/does-not-exist-${RUN_ID}/galerija`)
    await expectNotFoundPage(page)
    await expect(page.locator('img[src*="cloudinary"]')).toHaveCount(0)
  })

  test('admin /admin/grupe/<id> renders the Galerija panel with the uploaded image', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/grupe/${seeded.groupId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Galerija' })).toBeVisible({ timeout: 30000 })
    await expect(
      page.locator('button[aria-label="Otvori sliku"]').first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('/api/upload/gallery rejects unauthenticated → 401', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${BASE}/prijava`)
    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
    await ctx.close()
  })

  test('/api/upload/gallery rejects a STUDENT cookie → 401', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
  })

  test('/api/upload/gallery rejects a non-image MIME → 415', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'x.pdf')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  // ── W4 fix: Use aria-label selector instead of parent traversal ────────────

  test('teacher deletes the uploaded gallery image — student no longer sees it', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/galerija`)

    page.on('dialog', (d) => d.accept())
    const firstThumb = page.locator('button[aria-label="Otvori sliku"]').first()
    await firstThumb.waitFor({ state: 'visible', timeout: 10000 })
    // Find the delete button as a sibling within the same gallery grid area
    const deleteBtn = page.locator('button[aria-label="Obriši sliku"]').first()
    // Hover the thumbnail area to reveal the delete button
    await firstThumb.hover()
    await deleteBtn.waitFor({ state: 'visible', timeout: 5000 })
    await deleteBtn.click()

    await expect(page.locator('button[aria-label="Otvori sliku"]')).toHaveCount(0, {
      timeout: 10000,
    })

    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}/galerija`)
    await expect(page.locator('button[aria-label="Otvori sliku"]')).toHaveCount(0)
  })

  // ── C7: Gallery upload file size limit ─────────────────────────────────────

  test('/api/upload/gallery rejects files exceeding 10 MB limit → 413', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const result = await page.evaluate(async () => {
      // Create an 11 MB blob (exceeds the 10 MB limit)
      const size = 11 * 1024 * 1024
      const blob = new Blob([new ArrayBuffer(size)], { type: 'image/png' })
      const form = new FormData()
      form.append('file', blob, 'large.png')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      const body = await res.json()
      return { status: res.status, error: body.error }
    })
    expect(result.status).toBe(413)
    expect(result.error).toContain('File too large')
  })
})
