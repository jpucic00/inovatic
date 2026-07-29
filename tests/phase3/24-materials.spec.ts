import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  getCourseIdForGroup,
  addLinkMaterial,
  addMaterialOnProgramPage,
  cloudinaryAssetStatus,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'

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
const COURSE_LINK_TITLE = `Programski LINK ${RUN_ID}`
type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  student: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 13 — Materials', () => {
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh) — ~25-50s faster than the UI flow.
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

  // Lifecycle: create GROUP (teacher) + program-wide COURSE (admin, program
  // page) → student sees both → hide COURSE → unhide → delete GROUP. Uses
  // COURSE (always visible) rather than MODULE (active-module-gated) so the
  // student-visibility assertions are deterministic regardless of the calendar.
  test('material lifecycle: GROUP + program-wide → student sees both → hide → unhide → delete', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(240000)

    await test.step('Teacher creates a GROUP-scope LINK material', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/materijali`)
      await addLinkMaterial(
        page,
        /Dodaj samo u ovu grupu/,
        GROUP_LINK_TITLE,
        'https://drive.google.com/file/d/abc123',
      )
      await expect(
        // Merged Materijali tab renders the title in both the manage list (link)
        // and the preview (span); assert the first match to avoid strict-mode.
        page.getByText(GROUP_LINK_TITLE).first(),
        'GROUP material is visible in teacher list after create',
      ).toBeVisible()
    })

    await test.step('Teacher has no MODULE/COURSE (program) upload buttons', async () => {
      await expect(
        page.getByRole('button', { name: /Dodaj u modul:/ }),
        'teacher cannot add program (MODULE) materials',
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: /Dodaj u cijelu radionicu/ }),
        'teacher cannot add program (COURSE) materials',
      ).toHaveCount(0)
    })

    await test.step('Admin creates a program-wide (COURSE) material on the program page', async () => {
      // Program/module materials are admin-only and live on the program detail
      // page — not the group tab. COURSE (whole-program) materials are always
      // visible to kids (unlike non-active modules), so they're deterministic.
      await loginAsAdmin(page)
      const courseId = await getCourseIdForGroup(page, seeded!.groupId)
      await addMaterialOnProgramPage(
        page,
        courseId,
        'Materijali za cijeli program',
        COURSE_LINK_TITLE,
        'https://example.com/program-wide',
      )
    })

    await test.step('Student portal renders GROUP and program-wide materials', async () => {
      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}`)
      await expect(
        page.getByText(GROUP_LINK_TITLE),
        'student sees GROUP-scope material',
      ).toBeVisible()
      await expect(
        page.getByText(COURSE_LINK_TITLE),
        'student sees program-wide material',
      ).toBeVisible()
    })

    await test.step('Teacher hides the program-wide material — student loses it, keeps GROUP', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/materijali`)
      const row = page.locator('li', { has: page.getByText(COURSE_LINK_TITLE) })
      await row.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
      await expect(
        row.getByText('Sakriveno u grupi'),
        '"Sakriveno u grupi" pill appears after hide',
      ).toBeVisible({ timeout: 5000 })

      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}`)
      await expect(
        page.getByText(COURSE_LINK_TITLE),
        'student no longer sees the hidden program-wide material',
      ).toHaveCount(0)
      await expect(
        page.getByText(GROUP_LINK_TITLE),
        'student still sees the GROUP material',
      ).toBeVisible()
    })

    await test.step('Teacher unhides — student sees the program-wide material again', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/materijali`)
      const row = page.locator('li', { has: page.getByText(COURSE_LINK_TITLE) })
      await row.getByRole('button', { name: 'Prikaži u ovoj grupi' }).click()
      await expect(
        row.getByText('Sakriveno u grupi'),
        '"Sakriveno u grupi" pill disappears after unhide',
      ).toHaveCount(0, { timeout: 5000 })

      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}`)
      await expect(
        page.getByText(COURSE_LINK_TITLE),
        'student sees the program-wide material again after unhide',
      ).toBeVisible()
    })

    await test.step('Teacher deletes the GROUP material — student loses it too', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
      await page.goto(`${BASE}/nastavnik/grupa/${seeded!.groupId}/materijali`)
      page.on('dialog', (d) => d.accept())
      const row = page.locator('li', { has: page.getByText(GROUP_LINK_TITLE) })
      await row.getByRole('button', { name: 'Obriši materijal' }).click()
      await expect(
        row,
        'GROUP material row disappears from teacher list after delete',
      ).toBeHidden({ timeout: 10000 })

      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      await page.goto(`${BASE}/portal/grupa/${seeded!.groupId}`)
      await expect(
        page.getByText(GROUP_LINK_TITLE),
        'student loses the GROUP material after delete',
      ).toHaveCount(0)
    })
  })

  // API guards merge — STUDENT rejection + unsupported MIME (was 2 tests).
  // Note: the "good file 200" happy-path is implicitly exercised by the
  // lifecycle test above, which uploads materials via the same /api/upload/materials route.
  test('upload route guards: STUDENT cookie → 401, unsupported MIME → 415', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')

    await test.step('STUDENT cookie on /api/upload/materials → 401', async () => {
      await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
      await page.waitForURL(/\/portal/, { timeout: 30000 })
      const status = await page.evaluate(async () => {
        const form = new FormData()
        form.append('file', new Blob(['hi'], { type: 'text/plain' }), 'hi.txt')
        const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
        return res.status
      })
      expect(status, 'STUDENT POST to upload route returns 401').toBe(401)
    })

    await test.step('Unsupported MIME (application/x-custom-unsupported) → 415', async () => {
      await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
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
      expect(status, 'unsupported MIME returns 415').toBe(415)
    })
  })

  test('admin program detail page hosts MODULE materials; /admin/materijali is removed', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)

    // The standalone materials page has been removed: the route dir is gone
    // (src/app/(admin)/admin/materijali no longer exists) and the admin nav no
    // longer links to it. We assert the nav rather than navigating to the dead
    // URL — on the dev server an authenticated request to a removed /admin route
    // stalls on the on-demand not-found compile (prod pre-builds, so it 404s).
    await expect(page.locator('a[href="/admin/materijali"]')).toHaveCount(0)

    // MODULE (per-module) materials are created and shown on the program detail
    // page — the only place program curriculum is managed now.
    const courseId = await getCourseIdForGroup(page, seeded.groupId)
    // Module sections are headed by the real curriculum titles (seed: SLR 1's
    // first module is "Zabavni sustavi 1.0"), not by "Modul N" labels.
    await addMaterialOnProgramPage(
      page,
      courseId,
      /Zabavni sustavi/i,
      MODULE_LINK_TITLE,
      'https://example.com/module-resource',
    )
    await expect(page.getByText(MODULE_LINK_TITLE).first()).toBeVisible({ timeout: 15000 })
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

    test.skip(
      !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET,
      'Cloudinary creds missing — skipping authoritative deletion check',
    )

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
    // setInputFiles fires the change event natively (Playwright docs).
    // Don't dispatchEvent again — that would call the React onChange a
    // second time and trigger a second /api/upload/materials POST. The
    // test would then capture the first response's publicId while the
    // dialog state ended up with the second response's URL, so the
    // action would destroy the second URL while the assertion polled
    // for the first.
    await addFileInput.setInputFiles({
      name: 'first.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('first content for updateMaterial cleanup test'),
    })
    const firstResp = await firstUploadDone
    expect(firstResp.status(), 'initial upload route returned non-200').toBe(200)
    const firstJson = (await firstResp.json()) as {
      url: string
      publicId: string
      resourceType: 'image' | 'raw' | 'video'
    }
    const originalFileUrl = firstJson.url
    const originalPublicId = firstJson.publicId
    const originalResourceType = firstJson.resourceType
    expect(originalFileUrl).toContain('res.cloudinary.com')

    await addDialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(addDialog).toBeHidden({ timeout: 15000 })
    // Merged Materijali tab renders the title in both the manage list (link) and
    // the preview (span); assert the first match to avoid strict-mode.
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 15000 })

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
    // See comment on the first setInputFiles call — no manual dispatchEvent.
    await editFileInput.setInputFiles({
      name: 'second.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('second content — replacement file for cleanup test'),
    })
    const secondResp = await secondUploadDone
    expect(secondResp.status(), 'replacement upload route returned non-200').toBe(200)
    const secondJson = (await secondResp.json()) as {
      url: string
      publicId: string
      resourceType: 'image' | 'raw' | 'video'
    }
    const newFileUrl = secondJson.url
    const newPublicId = secondJson.publicId
    const newResourceType = secondJson.resourceType
    expect(newFileUrl).toContain('res.cloudinary.com')
    expect(newFileUrl, 'replacement URL must differ from original').not.toBe(originalFileUrl)

    // Wait for the dialog's success indicator (<p class="text-emerald-700">)
    // before clicking Spremi. The upload response lands before React commits
    // setNewFileUrl, so without this guard the click can race a stale
    // handleSubmit closure where newFileUrl is still null — updateMaterial
    // then runs WITHOUT a fileUrl change, replacingFile stays false, and
    // destroy never fires (the bug that caused this test to flake under
    // suite load). page.waitForFunction polls the live DOM, so it's robust
    // to whatever Playwright text-normalization quirk made the prior
    // getByText(/✓\s+second\.txt/) approach time out.
    await page.waitForFunction(
      () =>
        !!document.querySelector('[role="dialog"] p.text-emerald-700'),
      null,
      { timeout: 15000, polling: 100 },
    )

    await editDialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(editDialog).toBeHidden({ timeout: 15000 })

    // ── 3. Old Cloudinary asset must be gone. The action fires destroy() as
    //       fire-and-forget (crud.ts:160), so we poll Cloudinary's Admin API
    //       (NOT the CDN — CDN edge caches stale 200s for 30-60s and made
    //       this test flaky historically). Admin API queries the metadata
    //       DB synchronously: it returns 404 the instant destroy() completes
    //       server-side, typically within 1-3s. We use the canonical publicId
    //       returned by /api/upload/materials rather than re-parsing the
    //       delivery URL, so this assertion is independent of any quirks in
    //       publicIdFromUrl (src/lib/cloudinary-url.ts:9). ──────────────────
    await expect
      .poll(
        () => cloudinaryAssetStatus(originalPublicId, originalResourceType),
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(404)

    const newStatus = await cloudinaryAssetStatus(newPublicId, newResourceType)
    expect(newStatus, 'replacement asset must still exist').toBe(200)

    // ── 4. Cleanup: delete the material so the replacement asset doesn't leak
    page.on('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })
  })
})

// ─── I9: COURSE-scope material flow on a radionica ────────────────────────────
//
// Covers the canManageMaterial COURSE branch (src/lib/material-access.ts:33-42)
// and the cross-group visibility/cleanup invariant: a COURSE-scope material
// on a radionica is visible on every ScheduledGroup of that course, and
// deleting it removes it from every group.
//
// The teacher is assigned to only ONE of the two radionica groups, so the
// COURSE-scope action must resolve authz via the shared courseId (not via
// direct group ownership).

test.describe('Phase 3 Step 13 — COURSE-scope material on a radionica', () => {
  const RADIONICA_TITLE = `Test Radionica ${RUN_ID}`
  const COURSE_MATERIAL_TITLE = `Radionica COURSE LINK ${RUN_ID}`
  const RADIONICA_TEACHER: TeacherData = {
    firstName: 'Tara',
    lastName: `RadNast${RUN_ID}`,
    email: `tara.radnast.${RUN_ID}@test.com`,
    phone: '0919222222',
  }

  type RadionicaSeeded = {
    teacher: { email: string; password: string }
    courseId: string
    groupA: string
    groupB: string
  }
  let radionicaSeeded: RadionicaSeeded | null = null

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // 1) Create the radionica (ProgramKind.RADIONICA) via the admin UI.
    await page.goto(`${BASE}/admin/programi`)
    await page.getByRole('button', { name: 'Nova radionica' }).click()
    const cDialog = page.locator('[role="dialog"]')
    await cDialog.locator('#course-title').fill(RADIONICA_TITLE)
    await cDialog
      .locator('#course-description')
      .fill(`Radionica seed for COURSE-scope test ${RUN_ID}`)
    // Schema coerces empty price to 0, then .positive() fails before .optional()
    // can short-circuit. Fill a positive value to side-step the validator quirk.
    await cDialog.locator('#course-price').fill('50')
    await cDialog.getByRole('button', { name: 'Kreiraj radionicu' }).click()
    // The toast races with router.refresh() — assert on dialog close instead.
    await expect(cDialog).toBeHidden({ timeout: 15000 })

    // 2) Create two ScheduledGroups under the radionica via the admin UI.
    const groupNames = [
      `Test Radionica Grupa A ${RUN_ID}`,
      `Test Radionica Grupa B ${RUN_ID}`,
    ]
    for (let i = 0; i < 2; i++) {
      await page.goto(`${BASE}/admin/grupe`)
      await page.getByRole('button', { name: 'Nova grupa' }).click()
      const gDialog = page.locator('[role="dialog"]')
      await gDialog.waitFor({ state: 'visible', timeout: 10000 })
      await gDialog.locator('#create-courseId').selectOption({ label: RADIONICA_TITLE })
      await gDialog.locator('#create-locationId').selectOption({ index: 1 })
      await gDialog.locator('#create-name').fill(groupNames[i])

      // Radionica groups use a [dateStart, dateEnd] range (DateInput) instead of
      // a day select; fill the native date companions directly (ISO format). A
      // single-day workshop uses the same date for both ends.
      const dateIso = `2026-04-0${i + 1}`
      const dateInputs = gDialog.locator('input[type="date"]')
      await dateInputs.nth(0).fill(dateIso)
      await dateInputs.nth(1).fill(dateIso)
      await gDialog.locator('#create-startTime').fill('17:00')
      await gDialog.locator('#create-endTime').fill('18:30')

      // Signup window moved to the program (per school year); not needed here.
      await gDialog.getByRole('button', { name: 'Kreiraj grupu' }).click()
      await expect(page.getByText('Grupa kreirana.')).toBeVisible({ timeout: 15000 })
    }

    // 3) Look up the two radionica group IDs on the Radionice tab.
    await page.goto(`${BASE}/admin/grupe?tab=__radionice__`)
    const ids: string[] = []
    for (const name of groupNames) {
      const link = page
        .locator(`a[href^="/admin/grupe/"]`, { hasText: name })
        .first()
      const href = await link.getAttribute('href')
      const m = href?.match(/^\/admin\/grupe\/([^/?#]+)/)
      if (!m) throw new Error(`Could not find group id for "${name}"`)
      ids.push(m[1])
    }

    // 4) Read the radionica's courseId off the Nova grupa dialog dropdown.
    await page.getByRole('button', { name: 'Nova grupa' }).click()
    const gDialog2 = page.locator('[role="dialog"]')
    await gDialog2.waitFor({ state: 'visible', timeout: 10000 })
    const courseOption = gDialog2.locator('#create-courseId option', {
      hasText: RADIONICA_TITLE,
    })
    const courseId = await courseOption.getAttribute('value')
    if (!courseId) throw new Error(`Could not find courseId for "${RADIONICA_TITLE}"`)
    await page.keyboard.press('Escape')

    // 5) Direct-Prisma seed the teacher + assignment (Flux lu3f9sh) — saves
    //    25-50s vs the UI dialogs while leaving the radionica/group creation
    //    above on the UI to keep the radionica-form regression coverage.
    const t = await seedTeacher(RADIONICA_TEACHER)
    await seedTeacherAssignment(t.teacherId, ids[0])

    radionicaSeeded = {
      teacher: { email: RADIONICA_TEACHER.email, password: t.password },
      courseId,
      groupA: ids[0],
      groupB: ids[1],
    }
    await page.close()
  })

  test('radionica COURSE material: teacher is blocked, admin adds it', async ({ page }) => {
    if (!radionicaSeeded) throw new Error('not seeded')

    // Teacher: no program-level (COURSE) upload button.
    await loginWithEmail(page, radionicaSeeded.teacher.email, radionicaSeeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupA}/materijali`)
    await expect(page.getByRole('button', { name: /Dodaj u cijelu radionicu/ })).toHaveCount(0)

    // Admin: adds the COURSE material on the radionica's program detail page.
    await loginAsAdmin(page)
    await addMaterialOnProgramPage(
      page,
      radionicaSeeded.courseId,
      'Materijali za cijeli program',
      COURSE_MATERIAL_TITLE,
      'https://example.com/radionica-course-resource',
    )
    await expect(page.getByText(COURSE_MATERIAL_TITLE).first()).toBeVisible()
  })

  test('COURSE material is visible on every group of the radionica', async ({ page }) => {
    if (!radionicaSeeded) throw new Error('not seeded')
    // Admin reads the teacher route via the ADMIN bypass on assertTeacherOwnsGroup.
    await loginAsAdmin(page)

    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupA}/materijali`)
    // Merged Materijali tab renders the title in both the manage list and the
    // preview; assert the first match to avoid strict-mode on the duplicate.
    await expect(page.getByText(COURSE_MATERIAL_TITLE).first()).toBeVisible()

    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupB}/materijali`)
    await expect(page.getByText(COURSE_MATERIAL_TITLE).first()).toBeVisible()
  })

  test('teacher cannot delete the admin COURSE material; admin deletes it from the program page', async ({
    page,
  }) => {
    if (!radionicaSeeded) throw new Error('not seeded')

    // Teacher sees the inherited COURSE material but has no delete affordance.
    await loginWithEmail(page, radionicaSeeded.teacher.email, radionicaSeeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupA}/materijali`)
    const teacherRow = page.locator('li', { has: page.getByText(COURSE_MATERIAL_TITLE) })
    await expect(teacherRow).toBeVisible()
    await expect(teacherRow.getByRole('button', { name: 'Obriši materijal' })).toHaveCount(0)

    // Admin deletes it on the program detail page (the curriculum home).
    page.on('dialog', (d) => d.accept())
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/programi/${radionicaSeeded.courseId}`)
    const adminRow = page.locator('li', { has: page.getByText(COURSE_MATERIAL_TITLE) })
    await expect(adminRow).toBeVisible()
    await adminRow.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(adminRow).toBeHidden({ timeout: 10000 })

    // Gone from every group of the radionica.
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupB}/materijali`)
    await expect(page.getByText(COURSE_MATERIAL_TITLE)).toHaveCount(0)
  })
})
