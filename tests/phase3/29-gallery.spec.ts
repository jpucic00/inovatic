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

    // Wait until React has hydrated the input — without this, setInputFiles fires
    // a native change event that no handler catches yet. We check for React's
    // internal __reactProps$ key on the DOM node, which only appears post-hydration.
    await fileInput.evaluate((el) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
          else setTimeout(check, 50)
        }
        check()
      }),
    )

    // Decouple Cloudinary upload latency from the visibility assertion: wait for
    // /api/upload/gallery to return before checking the DOM. Under /validate's
    // back-to-back-suite environment Cloudinary EU can take 15-25s, eating the
    // 30s budget before router.refresh() repaints the grid.
    const uploadDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/upload/gallery') &&
        resp.request().method() === 'POST',
      { timeout: 60000 },
    )
    await fileInput.setInputFiles(SAMPLE_PNG)
    // Belt-and-braces: re-dispatch change in case Playwright's native event
    // arrived during a hydration micro-task window. Mirrors helpers/phase3.ts:236.
    await fileInput.evaluate((el) =>
      el.dispatchEvent(new Event('change', { bubbles: true })),
    )
    const uploadResp = await uploadDone
    expect(uploadResp.status(), 'gallery upload route returned non-200').toBe(200)

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
    await page.fill('#course-price', '50') // z.coerce.number().positive() rejects empty string
    await page.getByRole('button', { name: 'Kreiraj radionicu' }).click()
    await expect(page.getByText('Program kreiran.')).toBeVisible({ timeout: 10000 })

    // 2. Create radionica scheduled group
    await page.goto(`${BASE}/admin/grupe`)
    await page.getByRole('button', { name: 'Nova grupa' }).click()

    const courseSelect = page.locator('#create-courseId')
    await courseSelect.selectOption({ label: `Scope radionica ${RUN_ID}` })
    await page.locator('#create-locationId').selectOption({ index: 1 })
    await page.fill('#create-name', `ScopeGr ${RUN_ID}`)

    // Radionica: single date field (not dayOfWeek)
    const dateInput = page.locator('#create-date')
    await dateInput.fill('01.09.2025.')
    await dateInput.evaluate((el) => el.dispatchEvent(new Event('blur')))

    await page.fill('#create-startTime', '09:00')
    await page.fill('#create-endTime', '11:00')
    await page.fill('#create-schoolYear', '2025/2026')
    await page.fill('#create-maxStudents', '10')

    const enrollStart = page.locator('#create-enrollmentStart')
    await enrollStart.fill('01.01.2025.')
    await enrollStart.evaluate((el) => el.dispatchEvent(new Event('blur')))

    const enrollEnd = page.locator('#create-enrollmentEnd')
    await enrollEnd.fill('31.12.2027.')
    await enrollEnd.evaluate((el) => el.dispatchEvent(new Event('blur')))

    await page.getByRole('button', { name: 'Kreiraj grupu' }).click()
    await expect(page.getByText('Grupa kreirana.')).toBeVisible({ timeout: 10000 })

    // 3. Navigate to group detail to extract its ID (use ?tab=__radionice__ to skip tab default)
    await page.goto(`${BASE}/admin/grupe?tab=__radionice__`)
    const groupLink = page.getByRole('link', { name: new RegExp(`ScopeGr ${RUN_ID}`) }).first()
    await groupLink.waitFor({ state: 'visible', timeout: 10000 })
    await groupLink.click()
    await page.waitForURL(/\/admin\/grupe\/[a-z0-9]+/)
    const radionicaGroupId = page.url().split('/').pop() ?? ''
    expect(radionicaGroupId.length).toBeGreaterThan(0)

    // 4. Create teacher and assign to radionica group
    const t = await createTeacher(page, SCOPE_TEACHER)
    await assignTeacherToGroup(page, t.teacherId, radionicaGroupId)

    scopeSeeded = {
      teacher: { email: SCOPE_TEACHER.email, password: t.password },
      radionicaGroupId,
    }
    await page.close()
  })

  test('standard-program upload without moduleId → error', async ({ page }) => {
    // Admin passes through requireTeacher() — no dependency on outer seeded
    const stdGroupId = pickStandardGroupId(page)
    await loginAsAdmin(page)
    await page.waitForURL(/\/admin/, { timeout: 30000 })

    await page.route('**/api/upload/gallery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1/scope-std-test.jpg',
          publicId: `scope/std-${RUN_ID}`,
          width: 1,
          height: 1,
          bytes: 100,
        }),
      }),
    )

    // Intercept the server action POST and null out moduleId
    // Use regex so it matches the URL even when ?tab=... query param is appended
    await page.route(
      new RegExp(`nastavnik/grupa/${stdGroupId}/galerija`),
      async (route, request) => {
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
      },
    )

    await page.goto(`${BASE}/nastavnik/grupa/${stdGroupId}/galerija`)
    const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.evaluate((el) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
          else setTimeout(check, 50)
        }
        check()
      }),
    )

    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    })
    await fileInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))

    await expect(
      page.getByText('Standardni program zahtijeva modul.'),
    ).toBeVisible({ timeout: 15000 })
  })

  test('radionica upload WITH moduleId → error', async ({ page }) => {
    if (!scopeSeeded) throw new Error('not scope-seeded')
    const { teacher, radionicaGroupId } = scopeSeeded
    await loginWithEmail(page, teacher.email, teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    await page.route('**/api/upload/gallery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1/scope-rad-test.jpg',
          publicId: `scope/rad-${RUN_ID}`,
          width: 1,
          height: 1,
          bytes: 100,
        }),
      }),
    )

    // Intercept and inject a fake moduleId into the radionica server action call
    // Use regex to match URL with or without ?tab=... query param
    await page.route(
      new RegExp(`nastavnik/grupa/${radionicaGroupId}/galerija`),
      async (route, request) => {
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
      },
    )

    await page.goto(`${BASE}/nastavnik/grupa/${radionicaGroupId}/galerija`)
    const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.evaluate((el) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
          else setTimeout(check, 50)
        }
        check()
      }),
    )

    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    })
    await fileInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))

    await expect(
      page.getByText('Radionica nema module — galerija je grupna.'),
    ).toBeVisible({ timeout: 15000 })
  })

  test('radionica upload without moduleId → success', async ({ page }) => {
    if (!scopeSeeded) throw new Error('not scope-seeded')
    test.setTimeout(120000)
    const { teacher, radionicaGroupId } = scopeSeeded
    await loginWithEmail(page, teacher.email, teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaGroupId}/galerija`)

    const fileInput = page.locator('input[type="file"][id^="gallery-upload-"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.evaluate((el) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (Object.keys(el).some((k) => k.startsWith('__reactProps$'))) resolve()
          else setTimeout(check, 50)
        }
        check()
      }),
    )

    const uploadDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/upload/gallery') && resp.request().method() === 'POST',
      { timeout: 60000 },
    )
    await fileInput.setInputFiles(SAMPLE_PNG)
    await fileInput.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
    const uploadResp = await uploadDone
    expect(uploadResp.status(), 'gallery upload should return 200').toBe(200)

    await expect(
      page.locator('button[aria-label="Otvori sliku"]').first(),
    ).toBeVisible({ timeout: 30000 })
  })
})
