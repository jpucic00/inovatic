import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  createTeacher,
  assignTeacherToGroup,
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
// Phase 3 — Gallery (consolidated)
// 13 tests collapsed to 8:
//   - Lifecycle merge: upload → admin sees → student sees (read-only) →
//     teacher deletes → student no longer sees (was 3 separate tests + the
//     Galerija-tab visibility check)
//   - Scope-validation merge: standard requires moduleId + radionica forbids
//     moduleId + radionica-no-moduleId happy path (was 3 separate tests)
// Each merged test uses test.step() blocks; descriptive `expect(..., 'why')`
// labels added.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

const SCOPE_TEACHER: TeacherData = {
  firstName: 'Scope',
  lastName: `ScopeNast${RUN_ID}`,
  email: `scope.nast.${RUN_ID}@test.com`,
  phone: '0919229900',
}
type ScopeSeeded = {
  teacher: { email: string; password: string }
  radionicaGroupId: string
}
let scopeSeeded: ScopeSeeded | null = null

const HYDRATION_WAIT = (el: HTMLElement) =>
  new Promise<void>((resolve) => {
    const check = () => {
      if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
      else setTimeout(check, 50)
    }
    check()
  })

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — Gallery', () => {
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh).
    const groupId = pickStandardGroupId()
    const t = await seedTeacher(TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)
    const s = await seedStudentInGroup(groupId, STUDENT)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      student: { email: `${s.username}@student.inovatic.local`, password: s.password },
      groupId,
    }
  })

  // Lifecycle merge — original tests 2 + 5 + 9 (+ implicit Galerija tab
  // visibility check from old test 1 covered by the navigate step).
  test('lifecycle: teacher uploads → student/admin see → teacher deletes → student loses access', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(180000)

    await test.step('Teacher uploads a PNG via the gallery upload zone', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/galerija`)
      await expect(
        page.getByRole('link', { name: 'Galerija' }),
        'Galerija tab is present in the teacher group nav',
      ).toBeVisible()

      const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
      await fileInput.waitFor({ state: 'attached', timeout: 5000 })
      await fileInput.evaluate(HYDRATION_WAIT)

      const uploadDone = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/upload/gallery') &&
          resp.request().method() === 'POST',
        { timeout: 60000 },
      )
      await fileInput.setInputFiles(SAMPLE_PNG)
      await fileInput.evaluate((el) =>
        el.dispatchEvent(new Event('change', { bubbles: true })),
      )
      const uploadResp = await uploadDone
      expect(uploadResp.status(), 'gallery upload route returned 200').toBe(200)
      await expect(
        page.locator('button[aria-label="Otvori sliku"]').first(),
        'thumbnail appears in teacher gallery grid after upload',
      ).toBeVisible({ timeout: 30000 })
    })

    await test.step('Student sees the image read-only on /portal (no delete affordance)', async () => {
      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.waitForLoadState('domcontentloaded')
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}/galerija`)
      await expect(
        page.locator('button[aria-label="Otvori sliku"]').first(),
        'student sees the uploaded thumbnail',
      ).toBeVisible({ timeout: 10000 })
      await expect(
        page.locator('button[aria-label="Obriši sliku"]'),
        'student has NO delete affordance',
      ).toHaveCount(0)
    })

    await test.step('Admin /admin/grupe/<id> renders the Galerija panel with the image', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/grupe/${seeded!.groupId}`, { waitUntil: 'domcontentloaded' })
      await expect(
        page.getByRole('heading', { name: 'Galerija' }),
        'admin Galerija panel heading is visible',
      ).toBeVisible({ timeout: 30000 })
      await expect(
        page.locator('button[aria-label="Otvori sliku"]').first(),
        'admin Galerija panel shows the uploaded thumbnail',
      ).toBeVisible({ timeout: 10000 })
    })

    await test.step('Teacher deletes the image; student no longer sees it', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/galerija`)

      page.on('dialog', (d) => d.accept())
      const firstThumb = page.locator('button[aria-label="Otvori sliku"]').first()
      await firstThumb.waitFor({ state: 'visible', timeout: 10000 })
      const deleteBtn = page.locator('button[aria-label="Obriši sliku"]').first()
      await firstThumb.hover()
      await deleteBtn.waitFor({ state: 'visible', timeout: 5000 })
      await deleteBtn.click()

      await expect(
        page.locator('button[aria-label="Otvori sliku"]'),
        'teacher gallery is empty after delete',
      ).toHaveCount(0, { timeout: 10000 })

      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}/galerija`)
      await expect(
        page.locator('button[aria-label="Otvori sliku"]'),
        'student gallery is empty after teacher deletes',
      ).toHaveCount(0)
    })
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

  test('/api/upload/gallery rejects files exceeding 10 MB limit → 413', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const result = await page.evaluate(async () => {
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

test.describe('Gallery — scope validation', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // 1. Create radionica course
    await page.goto(`${BASE}/admin/programi`)
    await page.getByRole('button', { name: 'Nova radionica' }).click()
    await page.fill('#course-title', `Scope radionica ${RUN_ID}`)
    await page.fill('#course-description', 'Scope test description')
    await page.fill('#course-price', '50')
    await page.getByRole('button', { name: 'Kreiraj radionicu' }).click()
    await expect(page.getByText('Program kreiran.')).toBeVisible({ timeout: 10000 })

    // 2. Create radionica scheduled group
    await page.goto(`${BASE}/admin/grupe`)
    await page.getByRole('button', { name: 'Nova grupa' }).click()

    const courseSelect = page.locator('#create-courseId')
    await courseSelect.selectOption({ label: `Scope radionica ${RUN_ID}` })
    await page.locator('#create-locationId').selectOption({ index: 1 })
    await page.fill('#create-name', `ScopeGr ${RUN_ID}`)

    const dateInput = page.locator('#create-date')
    await dateInput.fill('01.09.2025.')
    await dateInput.evaluate((el) => el.dispatchEvent(new Event('blur')))

    await page.fill('#create-startTime', '09:00')
    await page.fill('#create-endTime', '11:00')
    await page.fill('#create-schoolYear', '2025/2026')
    await page.fill('#create-maxStudents', '10')

    // Signup window moved to the program (per school year); not needed here.
    await page.getByRole('button', { name: 'Kreiraj grupu' }).click()
    await expect(page.getByText('Grupa kreirana.')).toBeVisible({ timeout: 10000 })

    await page.goto(`${BASE}/admin/grupe?tab=__radionice__`)
    const groupLink = page.getByRole('link', { name: new RegExp(`ScopeGr ${RUN_ID}`) }).first()
    await groupLink.waitFor({ state: 'visible', timeout: 10000 })
    await groupLink.click()
    await page.waitForURL(/\/admin\/grupe\/[a-z0-9]+/)
    const radionicaGroupId = page.url().split('/').pop() ?? ''
    expect(radionicaGroupId.length).toBeGreaterThan(0)

    const t = await createTeacher(page, SCOPE_TEACHER)
    await assignTeacherToGroup(page, t.teacherId, radionicaGroupId)

    scopeSeeded = {
      teacher: { email: SCOPE_TEACHER.email, password: t.password },
      radionicaGroupId,
    }
    await page.close()
  })

  test('scope validation: standard requires moduleId, radionica forbids it, radionica-without happy path', async ({ page }) => {
    if (!scopeSeeded) throw new Error('not scope-seeded')
    test.setTimeout(240000)
    const { teacher, radionicaGroupId } = scopeSeeded

    // Stub Cloudinary upload to a deterministic success response for all
    // scope-validation steps — the assertions are about server-action gating,
    // not Cloudinary upload behaviour.
    await page.route('**/api/upload/gallery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1/scope-test.jpg',
          publicId: `scope/${RUN_ID}`,
          width: 1,
          height: 1,
          bytes: 100,
        }),
      }),
    )

    await test.step('Standard program: nulled moduleId → "Standardni program zahtijeva modul."', async () => {
      const stdGroupId = pickStandardGroupId(page)
      await loginAsAdmin(page)
      await page.waitForURL(/\/admin/, { timeout: 30000 })

      const stdRoute = new RegExp(`nastavnik/grupa/${stdGroupId}/galerija`)
      await page.route(stdRoute, async (route, request) => {
        if (request.method() !== 'POST' || !request.headers()['next-action']) {
          await route.continue()
          return
        }
        const raw = request.postData() ?? '[]'
        try {
          const args = JSON.parse(raw) as Array<Record<string, unknown>>
          const modified = args.map((a) =>
            typeof a === 'object' && a !== null ? { ...a, moduleId: null } : a,
          )
          await route.continue({ postData: JSON.stringify(modified) })
        } catch {
          await route.continue()
        }
      })

      await page.goto(`${BASE}/nastavnik/grupa/${stdGroupId}/galerija`)
      const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
      await fileInput.waitFor({ state: 'attached', timeout: 10000 })
      await fileInput.evaluate(HYDRATION_WAIT)
      await fileInput.setInputFiles({
        name: 'test.png',
        mimeType: 'image/png',
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      })
      await fileInput.evaluate((el) =>
        el.dispatchEvent(new Event('change', { bubbles: true })),
      )

      await expect(
        page.getByText('Standardni program zahtijeva modul.'),
        'standard-program upload without moduleId surfaces the validator error',
      ).toBeVisible({ timeout: 15000 })

      await page.unroute(stdRoute)
    })

    await test.step('Radionica: injected moduleId → "Radionica nema module — galerija je grupna."', async () => {
      await loginWithEmail(page, teacher.email, teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

      const radRoute = new RegExp(`nastavnik/grupa/${radionicaGroupId}/galerija`)
      await page.route(radRoute, async (route, request) => {
        if (request.method() !== 'POST' || !request.headers()['next-action']) {
          await route.continue()
          return
        }
        const raw = request.postData() ?? '[]'
        try {
          const args = JSON.parse(raw) as Array<Record<string, unknown>>
          const modified = args.map((a) =>
            typeof a === 'object' && a !== null
              ? { ...a, moduleId: 'injected-fake-module-id' }
              : a,
          )
          await route.continue({ postData: JSON.stringify(modified) })
        } catch {
          await route.continue()
        }
      })

      await page.goto(`${BASE}/nastavnik/grupa/${radionicaGroupId}/galerija`)
      const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
      await fileInput.waitFor({ state: 'attached', timeout: 10000 })
      await fileInput.evaluate(HYDRATION_WAIT)
      await fileInput.setInputFiles({
        name: 'test.png',
        mimeType: 'image/png',
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      })
      await fileInput.evaluate((el) =>
        el.dispatchEvent(new Event('change', { bubbles: true })),
      )

      await expect(
        page.getByText('Radionica nema module — galerija je grupna.'),
        'radionica upload with moduleId surfaces the validator error',
      ).toBeVisible({ timeout: 15000 })

      await page.unroute(radRoute)
    })

    await test.step('Radionica happy path: upload without moduleId → thumbnail appears', async () => {
      // Drop the stub for /api/upload/gallery so the real upload runs.
      await page.unroute('**/api/upload/gallery')

      await page.goto(`${BASE}/nastavnik/grupa/${radionicaGroupId}/galerija`)
      const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
      await fileInput.waitFor({ state: 'attached', timeout: 10000 })
      await fileInput.evaluate(HYDRATION_WAIT)

      const uploadDone = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/upload/gallery') &&
          resp.request().method() === 'POST',
        { timeout: 60000 },
      )
      await fileInput.setInputFiles(SAMPLE_PNG)
      await fileInput.evaluate((el) =>
        el.dispatchEvent(new Event('change', { bubbles: true })),
      )
      const uploadResp = await uploadDone
      expect(uploadResp.status(), 'radionica happy-path upload returns 200').toBe(200)

      await expect(
        page.locator('button[aria-label="Otvori sliku"]').first(),
        'radionica happy-path thumbnail appears in grid',
      ).toBeVisible({ timeout: 30000 })
    })
  })
})
