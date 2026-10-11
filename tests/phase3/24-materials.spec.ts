import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
  gotoPortalPath,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  groupLessonTarget,
  createLessonOnProgramPage,
  addGroupLinkMaterial,
  openAddGroupMaterial,
  addTeacherProgramMaterial,
  openLesson,
  lessonAudienceSection,
  materialCard,
  cloudinaryAssetStatus,
  type LessonTarget,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'

const RUN_ID = newRunId()

// Teardown: every fixture this spec creates carries RUN_ID in its name, e-mail or
// title, so one call removes exactly this run's rows and can reach no other.
// Without it each run's groups stay for good, and `/admin/grupe` packs a
// weekday's groups into one lane — past a few dozen leftovers the entries go
// zero-width and specs that never changed start failing on the litter.
// Best-effort by design: it swallows, so a teardown problem can never turn a
// green run red.
test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

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

const LESSON_TITLE = `Lekcija ${RUN_ID}`
const TEACHER_LINK = { title: `Priprema za nastavnika ${RUN_ID}`, url: 'https://example.com/priprema' }
const STUDENT_LINK = { title: `Radni list za djecu ${RUN_ID}`, url: 'https://example.com/radni-list' }
const GROUP_LINK = { title: `Grupni LINK ${RUN_ID}`, url: 'https://drive.google.com/file/d/abc123' }
const PROGRAM_TEACHER_TITLE = `Programska priprema ${RUN_ID}`

type Seeded = {
  teacher: { email: string; password: string; teacherId: string }
  student: { email: string; password: string }
  groupId: string
  target: LessonTarget
}
let seeded: Seeded | null = null
let lessonId = ''

async function asTeacher(page: Page, path: string) {
  await loginWithEmail(page, seeded!.teacher.email, seeded!.teacher.password)
  await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
  await page.goto(`${BASE}${path}`)
}

async function asStudent(page: Page, path: string) {
  await loginWithEmail(page, seeded!.student.email, seeded!.student.password)
  await page.waitForURL(/\/portal/, { timeout: 30000 })
  await gotoPortalPath(page, path)
}

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 13 — Materials (Materijali v2: lessons + audience)', () => {
  test.beforeAll(async () => {
    // Direct-Prisma seeding (Flux lu3f9sh) — ~25-50s faster than the UI flow.
    const groupId = pickStandardGroupId()
    const t = await seedTeacher(TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)
    const s = await seedStudentInGroup(groupId, STUDENT)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password, teacherId: t.teacherId },
      student: { email: s.loginEmail, password: s.password },
      groupId,
      // The portal shows only the module this group is on today, so the
      // fixture lesson goes there — whatever the calendar says that is.
      target: await groupLessonTarget(groupId),
    }
  })

  test('admin creates a lesson with one teacher link and one kids\' link', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginAsAdmin(page)
    lessonId = await createLessonOnProgramPage(page, {
      target: seeded.target,
      title: LESSON_TITLE,
      teacherLinks: [TEACHER_LINK],
      studentLinks: [STUDENT_LINK],
    })

    // Saved in one transaction with the lesson, each under its own audience.
    const section = (heading: string) =>
      page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
    await expect(section('Materijali za nastavnike').getByText(TEACHER_LINK.title)).toBeVisible()
    await expect(section('Materijali za polaznike').getByText(STUDENT_LINK.title)).toBeVisible()
    await expect(section('Materijali za nastavnike').getByText(STUDENT_LINK.title)).toHaveCount(0)

    // The program page lists it under its module.
    await page.goto(`${BASE}/admin/programi/${seeded.target.courseId}`)
    await expect(
      page.locator(`a[href="/admin/programi/${seeded.target.courseId}/lekcija/${lessonId}"]`),
    ).toContainText(LESSON_TITLE)
  })

  test('the portal shows the kids\' link and NOT the teacher link', async ({ page }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    await asStudent(page, `/portal/grupa/${seeded.groupId}`)

    const lesson = await openLesson(page, LESSON_TITLE)
    await expect(lesson.getByText(STUDENT_LINK.title)).toBeVisible()
    await expect(page.getByText(TEACHER_LINK.title)).toHaveCount(0)
    // Not merely hidden: the teacher row must not be in the payload at all.
    expect(await page.content()).not.toContain(TEACHER_LINK.title)
  })

  test('the teacher\'s group page shows both, curriculum rows read-only', async ({ page }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    await asTeacher(page, `/nastavnik/grupa/${seeded.groupId}/materijali`)

    // A reading tree: each material is a card under its own audience.
    const lesson = await openLesson(page, LESSON_TITLE)
    await expect(materialCard(lessonAudienceSection(page, lesson, 'TEACHER'), TEACHER_LINK.title)).toBeVisible()
    await expect(materialCard(lessonAudienceSection(page, lesson, 'STUDENT'), STUDENT_LINK.title)).toBeVisible()

    // Curriculum belongs to the program page: on the group page a teacher can
    // neither delete, edit, move nor hide it. Lessons are admin-only, and the
    // one way in is the "Dodaj materijal" modal.
    await expect(lesson.getByRole('button', { name: 'Obriši materijal' })).toHaveCount(0)
    for (const name of ['Sakrij u ovoj grupi', 'Prikaži u ovoj grupi', 'Uredi materijal', 'Uredi materijale', 'Odaberi datoteke']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: /Premjesti/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nova lekcija' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Dodaj materijal' })).toBeVisible()
  })

  test('the Dodaj materijal modal asks for whom, and RoboCamp is for polaznici only', async ({ page }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    await asTeacher(page, `/nastavnik/grupa/${seeded.groupId}/materijali`)

    const dialog = page.getByRole('dialog')
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole('button', { name: 'Dodaj materijal' }).click({ timeout: 2000 })
      }
      await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })

    const title = `Bez publike ${RUN_ID}`
    await dialog.locator('#group-material-title').fill(title)
    const option = dialog.locator('#group-material-lesson option').filter({ hasText: LESSON_TITLE }).first()
    await dialog.locator('#group-material-lesson').selectOption((await option.getAttribute('value'))!)
    await dialog.locator('label').filter({ hasText: /^Poveznica$/ }).click()
    await dialog.locator('#group-material-url').fill('https://example.com/bez-publike')

    // No default audience: publishing to the parents must be a choice.
    const save = dialog.getByRole('button', { name: 'Spremi', exact: true })
    await expect(dialog.getByRole('radio', { name: /Za nastavnike/ })).not.toBeChecked()
    await expect(dialog.getByRole('radio', { name: /Za polaznike/ })).not.toBeChecked()
    await expect(save).toBeDisabled()

    const robocamp = dialog.locator('label').filter({ hasText: /^RoboCamp$/ })
    await dialog.locator('label').filter({ hasText: 'Za nastavnike' }).click()
    await expect(robocamp).toHaveCount(0)
    await expect(save).toBeEnabled()
    await dialog.locator('label').filter({ hasText: 'Za polaznike' }).click()
    await expect(robocamp).toBeVisible()

    // A link that is not a link keeps Spremi off.
    await dialog.locator('#group-material-url').fill('example.com/bez-https')
    await expect(dialog.getByText('Unesite cijelu adresu, s https://.')).toBeVisible()
    await expect(save).toBeDisabled()

    // Closing saves nothing.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.reload()
    await openLesson(page, LESSON_TITLE)
    await expect(page.getByText(title)).toHaveCount(0)
  })

  // Lifecycle: teacher adds a GROUP kids' link into the lesson → student sees it
  // beside the curriculum link → teacher deletes the GROUP link → student keeps
  // only the curriculum one. (Hiding a curriculum material in one group has no
  // UI any more — owner, 2026-10-10; the action is covered by integration tests.)
  test('material lifecycle: GROUP + curriculum → student sees both → teacher deletes GROUP', async ({
    page,
  }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    test.setTimeout(240000)

    await test.step('Teacher adds a GROUP kids\' link into the lesson', async () => {
      await asTeacher(page, `/nastavnik/grupa/${seeded!.groupId}/materijali`)
      const card = await addGroupLinkMaterial(page, LESSON_TITLE, 'STUDENT', GROUP_LINK)
      // The group's own card is the uploader's to delete; the curriculum card
      // beside it has no delete button.
      await expect(card.getByRole('button', { name: 'Obriši materijal' })).toBeVisible()
      const lesson = await openLesson(page, LESSON_TITLE)
      const curriculum = materialCard(lessonAudienceSection(page, lesson, 'STUDENT'), STUDENT_LINK.title)
      await expect(curriculum).toBeVisible()
      await expect(curriculum.getByRole('button', { name: 'Obriši materijal' })).toHaveCount(0)
    })

    await test.step('Student portal renders the GROUP and the curriculum link', async () => {
      await asStudent(page, `/portal/grupa/${seeded!.groupId}`)
      const lesson = await openLesson(page, LESSON_TITLE)
      await expect(lesson.getByText(GROUP_LINK.title), 'student sees GROUP material').toBeVisible()
      await expect(lesson.getByText(STUDENT_LINK.title), 'student sees curriculum material').toBeVisible()
    })

    await test.step('Teacher deletes the GROUP link — student loses it, keeps the curriculum link', async () => {
      await asTeacher(page, `/nastavnik/grupa/${seeded!.groupId}/materijali`)
      const lesson = await openLesson(page, LESSON_TITLE)
      const card = materialCard(lessonAudienceSection(page, lesson, 'STUDENT'), GROUP_LINK.title)
      page.once('dialog', (d) => d.accept())
      await card.getByRole('button', { name: 'Obriši materijal' }).click()
      await expect(card).toBeHidden({ timeout: 10000 })

      await asStudent(page, `/portal/grupa/${seeded!.groupId}`)
      const portalLesson = await openLesson(page, LESSON_TITLE)
      await expect(portalLesson.getByText(STUDENT_LINK.title)).toBeVisible()
      await expect(page.getByText(GROUP_LINK.title)).toHaveCount(0)
    })
  })

  test('moving a teacher material to the polaznici asks first; moving back does not', async ({
    page,
  }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    test.setTimeout(180000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/programi/${seeded.target.courseId}/lekcija/${lessonId}`)

    const section = (heading: string) =>
      page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
    const teacherSection = section('Materijali za nastavnike')
    const studentSection = section('Materijali za polaznike')
    const confirm = page.getByRole('dialog')

    await test.step('Odustani leaves the material with the nastavnici', async () => {
      const row = teacherSection.locator('li').filter({ hasText: TEACHER_LINK.title })
      await expect(async () => {
        await row.getByRole('button', { name: 'Premjesti u polaznike' }).click({ timeout: 2000 })
        await expect(confirm).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 20000 })
      await expect(confirm.getByText('Premjestiti u materijale za polaznike?')).toBeVisible()
      await confirm.getByRole('button', { name: 'Odustani' }).click()
      await expect(confirm).toBeHidden()
      await expect(row).toBeVisible()
    })

    await test.step('confirming moves it into the polaznici section', async () => {
      const row = teacherSection.locator('li').filter({ hasText: TEACHER_LINK.title })
      await row.getByRole('button', { name: 'Premjesti u polaznike' }).click()
      await confirm.getByRole('button', { name: 'Premjesti u polaznike' }).click()
      await expect(studentSection.getByText(TEACHER_LINK.title)).toBeVisible({ timeout: 15000 })
      await expect(teacherSection.getByText(TEACHER_LINK.title)).toHaveCount(0)
    })

    await test.step('the portal now shows it', async () => {
      await asStudent(page, `/portal/grupa/${seeded!.groupId}`)
      const lesson = await openLesson(page, LESSON_TITLE)
      await expect(lesson.getByText(TEACHER_LINK.title)).toBeVisible()
    })

    await test.step('back to the nastavnici goes straight through — and off the portal', async () => {
      await loginAsAdmin(page)
      await page.goto(`${BASE}/admin/programi/${seeded!.target.courseId}/lekcija/${lessonId}`)
      const row = studentSection.locator('li').filter({ hasText: TEACHER_LINK.title })
      await expect(async () => {
        await row.getByRole('button', { name: 'Premjesti u nastavnike' }).click({ timeout: 2000 })
        await expect(teacherSection.getByText(TEACHER_LINK.title)).toBeVisible({ timeout: 5000 })
      }).toPass({ timeout: 20000 })
      await expect(confirm).toHaveCount(0)

      await asStudent(page, `/portal/grupa/${seeded!.groupId}`)
      await openLesson(page, LESSON_TITLE)
      await expect(page.getByText(TEACHER_LINK.title)).toHaveCount(0)
    })
  })

  // API guards merge — STUDENT rejection + unsupported MIME (was 2 tests).
  // The "good file 200" happy path is exercised by the replace-file test below,
  // which uploads through the same /api/upload/materials route.
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

  test('teacher-only program material: staff see it, the portal never does; /admin/materijali is gone', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginAsAdmin(page)

    // The standalone materials page has been removed: the route dir is gone and
    // the admin nav no longer links to it. We assert the nav rather than
    // navigating to the dead URL — on the dev server an authenticated request to
    // a removed /admin route stalls on the on-demand not-found compile.
    await expect(page.locator('a[href="/admin/materijali"]')).toHaveCount(0)

    // MODULE/COURSE rows survive Materijali v2 only as teacher-only preparation.
    await addTeacherProgramMaterial(
      page,
      seeded.target.courseId,
      PROGRAM_TEACHER_TITLE,
      'https://example.com/program-priprema',
    )

    await asTeacher(page, `/nastavnik/grupa/${seeded.groupId}/materijali`)
    await expect(page.getByRole('heading', { name: 'Za nastavnike — cijeli program' })).toBeVisible()
    await expect(page.getByText(PROGRAM_TEACHER_TITLE)).toBeVisible()

    await asStudent(page, `/portal/grupa/${seeded.groupId}`)
    await expect(page.getByRole('heading', { name: seeded.target.moduleTitle!, exact: true })).toBeVisible()
    expect(await page.content()).not.toContain(PROGRAM_TEACHER_TITLE)
  })

  // ── I7: a teacher-only GROUP material ───────────────────────────────────

  test('a GROUP material for nastavnici stays off the portal and its uploader deletes it', async ({ page }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    await asTeacher(page, `/nastavnik/grupa/${seeded.groupId}/materijali`)

    const title = `GROUP-teacher-only ${RUN_ID}`
    const card = await addGroupLinkMaterial(page, LESSON_TITLE, 'TEACHER', {
      title,
      url: 'https://example.com/teacher-only',
    })

    await asStudent(page, `/portal/grupa/${seeded.groupId}`)
    await openLesson(page, LESSON_TITLE)
    expect(await page.content()).not.toContain(title)

    await asTeacher(page, `/nastavnik/grupa/${seeded.groupId}/materijali`)
    await openLesson(page, LESSON_TITLE)
    page.once('dialog', (d) => d.accept())
    await card.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(card).toBeHidden({ timeout: 10000 })
  })

  // /admin/grupe/[id] renders the same tree and modal as the teacher tab; this
  // is the one test that drives the admin path end to end.
  test('admin adds a kids\' GROUP material from the group page; the portal shows it; admin deletes it', async ({
    page,
  }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/grupe/${seeded.groupId}`)

    const title = `GROUP-admin ${RUN_ID}`
    const card = await addGroupLinkMaterial(page, LESSON_TITLE, 'STUDENT', {
      title,
      url: 'https://example.com/admin-group',
    })
    // The admin may delete any GROUP row of their own city's group.
    await expect(card.getByRole('button', { name: 'Obriši materijal' })).toBeVisible()

    await asStudent(page, `/portal/grupa/${seeded.groupId}`)
    const portalLesson = await openLesson(page, LESSON_TITLE)
    await expect(portalLesson.getByText(title)).toBeVisible()

    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/grupe/${seeded.groupId}`)
    const lesson = await openLesson(page, LESSON_TITLE)
    const again = materialCard(lessonAudienceSection(page, lesson, 'STUDENT'), title)
    page.once('dialog', (d) => d.accept())
    await again.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(again).toBeHidden({ timeout: 10000 })
  })

  // ── I8: updateMaterial happy path with Cloudinary cleanup of old asset ────

  test('material files: teacher uploads one through the group modal; admin replaces one — old Cloudinary asset is destroyed', async ({
    page,
  }) => {
    if (!seeded || !lessonId) throw new Error('not seeded')
    test.setTimeout(180000)

    test.skip(
      !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET,
      'Cloudinary creds missing — skipping authoritative deletion check',
    )

    await test.step('teacher uploads a file into the group through the modal, then deletes it', async () => {
      await asTeacher(page, `/nastavnik/grupa/${seeded!.groupId}/materijali`)
      const GROUP_FILE = `Grupna datoteka ${RUN_ID}`
      const dialog = await openAddGroupMaterial(page, LESSON_TITLE, 'TEACHER')
      // Datoteka is the default kind.
      const fileInput = dialog.locator('#group-material-file')
      // Picking only stages the file — nothing reaches Cloudinary before Spremi.
      const uploads: string[] = []
      page.on('request', (req) => {
        if (req.url().includes('/api/upload/materials') && req.method() === 'POST') uploads.push(req.url())
      })
      await fileInput.setInputFiles({
        name: `${GROUP_FILE}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from('group file uploaded through the Dodaj materijal modal'),
      })
      // The picked file names the material.
      await expect(dialog.locator('#group-material-title')).toHaveValue(GROUP_FILE)
      expect(uploads, 'no upload before Spremi').toHaveLength(0)
      const save = dialog.getByRole('button', { name: 'Spremi', exact: true })
      await expect(save).toBeEnabled({ timeout: 15000 })
      const uploaded = page.waitForResponse(
        (resp) => resp.url().includes('/api/upload/materials') && resp.request().method() === 'POST',
        { timeout: 60000 },
      )
      await save.click()
      expect((await uploaded).status(), 'group upload route returned non-200').toBe(200)
      await expect(dialog).toBeHidden({ timeout: 30000 })
      expect(uploads, 'exactly one upload, on Spremi').toHaveLength(1)

      const lesson = await openLesson(page, LESSON_TITLE)
      const card = materialCard(lessonAudienceSection(page, lesson, 'TEACHER'), GROUP_FILE)
      await expect(card).toBeVisible({ timeout: 20000 })
      page.once('dialog', (d) => d.accept())
      await card.getByRole('button', { name: 'Obriši materijal' }).click()
      await expect(card).toBeHidden({ timeout: 10000 })
    })

    // Replacing a file lives in the lesson editor now — the group page has no
    // edit control. The drop zone names the material after the file.
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/programi/${seeded.target.courseId}/lekcija/${lessonId}`)
    const TITLE = `Replace File Test ${RUN_ID}`

    // ── 1. Upload an initial DOCUMENT (text/plain) into the lesson ────────────
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { level: 2, name: 'Materijali za nastavnike' }),
    })
    const addFileInput = section.locator('input[type="file"]')
    await addFileInput.waitFor({ state: 'attached', timeout: 5000 })
    // React-hydration wait — otherwise setInputFiles can fire before React
    // attaches its onChange.
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
    // setInputFiles fires the change event natively — no extra dispatchEvent,
    // which would upload a second time.
    await addFileInput.setInputFiles({
      name: `${TITLE}.txt`,
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

    // The row is created as soon as the upload lands (an existing lesson).
    const row = section.locator('li').filter({ has: page.getByRole('link', { name: TITLE }) })
    await expect(row).toBeVisible({ timeout: 20000 })

    // ── 2. Open Edit dialog and upload a replacement file ─────────────────────
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

    // Wait for the dialog's success indicator before clicking Spremi — the
    // upload response lands before React commits the new file URL, and a click
    // in between saves WITHOUT the replacement, so destroy never fires.
    await page.waitForFunction(
      () =>
        !!document.querySelector('[role="dialog"] p.text-emerald-700'),
      null,
      { timeout: 15000, polling: 100 },
    )

    await editDialog.getByRole('button', { name: 'Spremi' }).click()
    await expect(editDialog).toBeHidden({ timeout: 15000 })

    // ── 3. Old Cloudinary asset must be gone. destroy() is fire-and-forget, so
    //       poll Cloudinary's Admin API (NOT the CDN, whose edge caches stale
    //       200s) with the canonical publicId the upload route returned. ──────
    await expect
      .poll(
        () => cloudinaryAssetStatus(originalPublicId, originalResourceType),
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(404)

    const newStatus = await cloudinaryAssetStatus(newPublicId, newResourceType)
    expect(newStatus, 'replacement asset must still exist').toBe(200)

    // ── 4. Cleanup: delete the material so the replacement asset doesn't leak
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(row).toBeHidden({ timeout: 10000 })
  })
})

// ─── I9: a radionica's lesson reaches every group of the radionica ───────────
//
// A radionica has no modules: its lessons hang directly off the program and
// are shared by all its groups. The teacher is assigned to only ONE of the two
// groups — the lesson is the admin's, visible in both, deletable by neither
// teacher.

test.describe('Phase 3 Step 13 — lesson material on a radionica', () => {
  const RADIONICA_TITLE = `Test Radionica ${RUN_ID}`
  const RADIONICA_LESSON = `Radionica lekcija ${RUN_ID}`
  const RADIONICA_LINK = {
    title: `Radionica LINK ${RUN_ID}`,
    url: 'https://example.com/radionica-resource',
  }
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
  let radionicaLessonId = ''

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
      .fill(`Radionica seed for the lesson-material test ${RUN_ID}`)
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

    // 5) Direct-Prisma seed the teacher + assignment (Flux lu3f9sh).
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

  test('radionica lesson: the teacher cannot add one, the admin can', async ({ page }) => {
    if (!radionicaSeeded) throw new Error('not seeded')
    test.setTimeout(120000)

    // Teacher: lessons come from the program page, the group tab only explains.
    await loginWithEmail(page, radionicaSeeded.teacher.email, radionicaSeeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupA}/materijali`)
    await expect(page.getByText(/Program još nema lekcija/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nova lekcija' })).toHaveCount(0)

    // Admin: the radionica's lesson has no module and no sats.
    await loginAsAdmin(page)
    radionicaLessonId = await createLessonOnProgramPage(page, {
      target: { courseId: radionicaSeeded.courseId, moduleId: null, moduleTitle: null },
      title: RADIONICA_LESSON,
      studentLinks: [RADIONICA_LINK],
    })
    await expect(page.getByText(/Radionica nema numerirane sate/)).toBeVisible()
  })

  test('the lesson is visible on every group of the radionica', async ({ page }) => {
    if (!radionicaSeeded || !radionicaLessonId) throw new Error('not seeded')
    // Admin reads the teacher route via the ADMIN bypass on assertTeacherOwnsGroup.
    await loginAsAdmin(page)

    for (const groupId of [radionicaSeeded.groupA, radionicaSeeded.groupB]) {
      await page.goto(`${BASE}/nastavnik/grupa/${groupId}/materijali`)
      const lesson = await openLesson(page, RADIONICA_LESSON)
      await expect(lesson.getByText(RADIONICA_LINK.title)).toBeVisible()
    }
  })

  test('teacher cannot delete the admin\'s lesson material; admin deletes it in the lesson editor', async ({
    page,
  }) => {
    if (!radionicaSeeded || !radionicaLessonId) throw new Error('not seeded')

    // Teacher sees the curriculum material but has no delete affordance.
    await loginWithEmail(page, radionicaSeeded.teacher.email, radionicaSeeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupA}/materijali`)
    const teacherLesson = await openLesson(page, RADIONICA_LESSON)
    const teacherRow = materialCard(teacherLesson, RADIONICA_LINK.title)
    await expect(teacherRow).toBeVisible()
    await expect(teacherRow.getByRole('button', { name: 'Obriši materijal' })).toHaveCount(0)

    // Admin deletes it in the lesson editor (the curriculum home).
    page.on('dialog', (d) => d.accept())
    await loginAsAdmin(page)
    await page.goto(
      `${BASE}/admin/programi/${radionicaSeeded.courseId}/lekcija/${radionicaLessonId}`,
    )
    const adminRow = page.locator('li').filter({ hasText: RADIONICA_LINK.title })
    await expect(adminRow).toBeVisible()
    await adminRow.getByRole('button', { name: 'Obriši materijal' }).click()
    await expect(adminRow).toBeHidden({ timeout: 10000 })

    // Gone from every group of the radionica.
    await page.goto(`${BASE}/nastavnik/grupa/${radionicaSeeded.groupB}/materijali`)
    await openLesson(page, RADIONICA_LESSON)
    await expect(page.getByText(RADIONICA_LINK.title)).toHaveCount(0)
  })

  test('portal: a radionica group offers two tabs, and /evaluacija explains itself', async ({
    page,
  }) => {
    if (!radionicaSeeded) throw new Error('radionica not seeded')

    // Radionice are never graded, so the Evaluacija tab must not exist — and a
    // mailed /evaluacija link must land on an explanation, never a 404.
    const s = await seedStudentInGroup(radionicaSeeded.groupA, {
      firstName: 'Iva',
      lastName: `RadKid${RUN_ID}`,
      dateOfBirth: '2015-06-06',
      childSchool: 'OŠ Rad',
      parentName: `Roditelj Rad ${RUN_ID}`,
      parentEmail: `rad.kid.${RUN_ID}@test.com`,
      parentPhone: '0911117777',
    })

    await loginWithEmail(page, s.loginEmail, s.password)
    // One enrollment: /portal forwards straight to the group page.
    await page.waitForURL(new RegExp(`/portal/grupa/${radionicaSeeded.groupA}`), {
      timeout: 30000,
    })

    await expect(page.getByRole('link', { name: 'Materijali' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Galerija' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Evaluacija' })).toHaveCount(0)

    await gotoPortalPath(
      page,
      `/portal/grupa/${radionicaSeeded.groupA}/evaluacija`,
    )
    await expect(page.getByText('Ova grupa se ne ocjenjuje')).toBeVisible()
  })
})
