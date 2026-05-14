import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  collectGroupIds,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  createStudentNoEnrollment,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

// Pin the /api/download authorization matrix. The route at
// src/app/api/download/[materialId]/route.ts has three role branches
// (ADMIN / TEACHER / STUDENT) plus the unauth path, and STUDENT additionally
// honors MaterialGroupHide while TEACHER deliberately bypasses it. This
// spec exercises each leg so future refactors of material-access.ts or
// material-query.ts can't quietly regress it.
//
// COURSE-scope is intentionally omitted: the standard seed has no radionica
// (`Course.isCustom = true`) group, and creating one via UI is brittle.
// GROUP + MODULE coverage hits every distinct authorization path, including
// hide-bypass for staff and hide-block for students.

const RUN_ID = Date.now().toString().slice(-6)
const NON_EXISTENT_ID = 'cltest_doesnotexist_aaaa'

const T_ASSIGNED: TeacherData = {
  firstName: 'Tea',
  lastName: `DLAssign${RUN_ID}`,
  email: `tea.dlassign.${RUN_ID}@test.com`,
  phone: '0911000001',
}
const T_UNASSIGNED: TeacherData = {
  firstName: 'Una',
  lastName: `DLUna${RUN_ID}`,
  email: `una.dluna.${RUN_ID}@test.com`,
  phone: '0911000002',
}
const S_ENROLLED: StudentData = {
  firstName: 'Ema',
  lastName: `DLEnr${RUN_ID}`,
  dateOfBirth: '2016-03-03',
  childSchool: 'OŠ DL',
  parentName: `Roditelj DLEnr ${RUN_ID}`,
  parentEmail: `dl.enr.${RUN_ID}@test.com`,
  parentPhone: '0911000003',
}
const S_NONE: StudentData = {
  firstName: 'Noa',
  lastName: `DLNone${RUN_ID}`,
  dateOfBirth: '2016-04-04',
  childSchool: 'OŠ DL',
  parentName: `Roditelj DLNone ${RUN_ID}`,
  parentEmail: `dl.none.${RUN_ID}@test.com`,
  parentPhone: '0911000004',
}

const M_GROUP_A_TITLE = `Grupa-A-DL ${RUN_ID}`
const M_MODULE_TITLE = `Modul-DL ${RUN_ID}`
const M_GROUP_B_TITLE = `Grupa-B-DL ${RUN_ID}`
// Croatian diacritics in title — exercises sanitiseFilename's NFD-strip path.
// After sanitisation: Čćžš lose combining marks → Cczs; đ has no NFD
// decomposition and falls through to the [^a-zA-Z0-9._-] pass → _.
const M_DIACRITIC_TITLE = `Čćžšđ-DL ${RUN_ID}`

type Seeded = {
  teacherAssigned: { email: string; password: string }
  teacherUnassigned: { email: string; password: string }
  studentEnrolled: { email: string; password: string }
  studentNone: { email: string; password: string }
  groupA: string
  groupB: string
  materialGroupA: string
  materialModule: string
  materialGroupB: string
  materialDiacritic: string
}
let seeded: Seeded | null = null

async function uploadFileMaterial(
  page: Page,
  buttonRegex: RegExp,
  title: string,
): Promise<string> {
  await page.getByRole('button', { name: buttonRegex }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  await dialog.locator('#material-title').fill(title)
  // DOCUMENT is the default Tip; text/plain is in DOC_TYPES (route.ts:20).
  const fileInput = dialog.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: `${title}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`download-access-matrix fixture · ${title}`),
  })
  const submitBtn = dialog.getByRole('button', { name: 'Spremi' })
  // canSubmit flips true once /api/upload/materials returns and fileUrl is set.
  await expect(submitBtn).toBeEnabled({ timeout: 45000 })
  await submitBtn.click()
  await expect(dialog).toBeHidden({ timeout: 15000 })

  const row = page.locator('li', { has: page.getByText(title) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  const href = await row
    .locator('a[href^="/api/download/"]')
    .first()
    .getAttribute('href')
  const m = href?.match(/^\/api\/download\/([^/?#]+)/)
  if (!m) throw new Error(`Could not extract materialId for "${title}" (href=${href ?? 'null'})`)
  return m[1]
}

async function fetchDownload(
  page: Page,
  materialId: string,
): Promise<{ status: number; contentDisposition: string | null }> {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/download/${id}`)
    return {
      status: r.status,
      contentDisposition: r.headers.get('content-disposition'),
    }
  }, materialId)
}

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — /api/download access matrix', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(360000)
    const page = await browser.newPage()
    try {
      await loginAsAdmin(page)

      const [groupA, groupB] = collectGroupIds(page, 2)

      const tAssigned = await createTeacher(page, T_ASSIGNED)
      await assignTeacherToGroup(page, tAssigned.teacherId, groupA)
      const tUnassigned = await createTeacher(page, T_UNASSIGNED)

      const sEnrolled = await createStudentInGroup(page, groupA, S_ENROLLED)
      const sNone = await createStudentNoEnrollment(page, S_NONE)

      // Admin passes through requireTeacher() on /nastavnik/* per Phase 3
      // conventions, so we use the teacher panel's upload dialogs as ADMIN.
      await page.goto(`${BASE}/nastavnik/grupa/${groupA}/materijali`)
      const materialGroupA = await uploadFileMaterial(
        page,
        /Dodaj samo u ovu grupu/,
        M_GROUP_A_TITLE,
      )

      await page.goto(`${BASE}/nastavnik/grupa/${groupA}/materijali`)
      const materialModule = await uploadFileMaterial(
        page,
        /Dodaj u modul:/,
        M_MODULE_TITLE,
      )

      await page.goto(`${BASE}/nastavnik/grupa/${groupA}/materijali`)
      const materialDiacritic = await uploadFileMaterial(
        page,
        /Dodaj samo u ovu grupu/,
        M_DIACRITIC_TITLE,
      )

      await page.goto(`${BASE}/nastavnik/grupa/${groupB}/materijali`)
      const materialGroupB = await uploadFileMaterial(
        page,
        /Dodaj samo u ovu grupu/,
        M_GROUP_B_TITLE,
      )

      // Hide the MODULE-scoped material in groupA so we can verify that
      // staff still see it (ADMIN, T_ASSIGNED) and students do not.
      await page.goto(`${BASE}/nastavnik/grupa/${groupA}/materijali`)
      const moduleRow = page.locator('li', { has: page.getByText(M_MODULE_TITLE) })
      await moduleRow.getByRole('button', { name: 'Sakrij u ovoj grupi' }).click()
      await expect(moduleRow.getByText('Sakriveno u grupi')).toBeVisible({
        timeout: 10000,
      })

      seeded = {
        teacherAssigned: { email: T_ASSIGNED.email, password: tAssigned.password },
        teacherUnassigned: { email: T_UNASSIGNED.email, password: tUnassigned.password },
        studentEnrolled: {
          email: `${sEnrolled.username}@student.inovatic.local`,
          password: sEnrolled.password,
        },
        studentNone: {
          email: `${sNone.username}@student.inovatic.local`,
          password: sNone.password,
        },
        groupA,
        groupB,
        materialGroupA,
        materialModule,
        materialGroupB,
        materialDiacritic,
      }
    } finally {
      await page.close()
    }
  })

  // ── Unauth ────────────────────────────────────────────────────────────────

  test('unauthenticated GET → 401 JSON', async ({ request }) => {
    if (!seeded) throw new Error('not seeded')
    const res = await request.get(`${BASE}/api/download/${seeded.materialGroupA}`, {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    expect(body.error).toBeTruthy()
  })

  // ── ADMIN ─────────────────────────────────────────────────────────────────

  test('ADMIN → GROUP-scope material → 200 + Content-Disposition', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    const res = await fetchDownload(page, seeded.materialGroupA)
    expect(res.status).toBe(200)
    expect(res.contentDisposition).toMatch(/^attachment; filename=/)
  })

  test('ADMIN → MODULE-scope material despite group hide → 200', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    const res = await fetchDownload(page, seeded.materialModule)
    expect(res.status).toBe(200)
  })

  test('ADMIN → non-existent materialId → 404', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await fetchDownload(page, NON_EXISTENT_ID)
    expect(res.status).toBe(404)
  })

  test('ADMIN → diacritic-title material → Content-Disposition filename is sanitised', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginAsAdmin(page)
    const res = await fetchDownload(page, seeded.materialDiacritic)
    expect(res.status).toBe(200)
    // Pins cloudinary-url.ts sanitiseFilename(): NFD-strip removes Čćžš combining
    // marks → Cczs; đ has no NFD decomposition so the next pass replaces it with
    // `_`; trailing space + RUN_ID becomes `_<RUN_ID>`; ext from text/plain → .txt.
    expect(res.contentDisposition).toMatch(/filename="Cczs_-DL_\d+\.txt"/)
  })

  // ── TEACHER ───────────────────────────────────────────────────────────────

  test('TEACHER assigned to GROUP_A → M_GROUP_A → 200', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherAssigned.email, seeded.teacherAssigned.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupA)
    expect(res.status).toBe(200)
  })

  test('TEACHER assigned to GROUP_A → M_MODULE (hidden in A) → 200 (hide is staff-bypassed)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherAssigned.email, seeded.teacherAssigned.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialModule)
    expect(res.status).toBe(200)
  })

  test('TEACHER assigned to GROUP_A → M_GROUP_B → 404 (no assignment to B)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherAssigned.email, seeded.teacherAssigned.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupB)
    expect(res.status).toBe(404)
  })

  test('TEACHER with no assignments → M_GROUP_A → 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacherUnassigned.email, seeded.teacherUnassigned.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupA)
    expect(res.status).toBe(404)
  })

  // ── STUDENT ───────────────────────────────────────────────────────────────

  test('STUDENT enrolled in GROUP_A → M_GROUP_A → 200 + Content-Disposition', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentEnrolled.email, seeded.studentEnrolled.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupA)
    expect(res.status).toBe(200)
    expect(res.contentDisposition).toMatch(/^attachment; filename=/)
  })

  test('STUDENT enrolled in GROUP_A → M_MODULE (hidden in A) → 404 (hide blocks student)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentEnrolled.email, seeded.studentEnrolled.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialModule)
    expect(res.status).toBe(404)
  })

  test('STUDENT enrolled in GROUP_A → M_GROUP_B → 404 (not enrolled in B)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentEnrolled.email, seeded.studentEnrolled.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupB)
    expect(res.status).toBe(404)
  })

  test('STUDENT with no enrollments → M_GROUP_A → 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentNone.email, seeded.studentNone.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    const res = await fetchDownload(page, seeded.materialGroupA)
    expect(res.status).toBe(404)
  })
})
