import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickStandardGroupId,
  getGroupCourseTitle,
  addLinkMaterial,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import { seedTeacher, seedTeacherAssignment, seedStudentInGroup } from '../helpers/seed'

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
  firstName: 'Luka',
  lastName: `RedNast${RUN_ID}`,
  email: `red.nast.${RUN_ID}@test.com`,
  phone: '0919333333',
}
const STUDENT: StudentData = {
  firstName: 'Pero',
  lastName: `RedKid${RUN_ID}`,
  dateOfBirth: '2016-02-02',
  childSchool: 'OŠ Red',
  parentName: `Roditelj Red ${RUN_ID}`,
  parentEmail: `red.kid.${RUN_ID}@test.com`,
  parentPhone: '0911119999',
}

const PROGRAM_LINK_TITLE = `Program-wide LINK ${RUN_ID}`
const ROBOCAMP_TITLE = `RoboCamp vodič ${RUN_ID}`

type Seeded = {
  teacher: { email: string; password: string }
  student: { email: string; password: string }
  groupId: string
  courseId: string
  courseTitle: string
}
let seeded: Seeded | null = null

/** Adds a ROBOCAMP material via the first "Dodaj" dialog on the current page. */
async function addRobocampMaterial(page: Page, title: string, url: string) {
  await page.getByRole('button', { name: /^Dodaj$/ }).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('#material-title').fill(title)
  await dialog.locator('label', { hasText: 'RoboCamp' }).click()
  await dialog.locator('#material-external-url').fill(url)
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })
  await expect(page.getByText(title)).toBeVisible({ timeout: 15000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — Materials redesign: program hub + RoboCamp-first kids page', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    await loginAsAdmin(page)

    const groupId = pickStandardGroupId()
    const t = await seedTeacher(TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)
    const s = await seedStudentInGroup(groupId, STUDENT)

    // Resolve the program's courseId by opening its detail page from the list.
    const courseTitle = await getGroupCourseTitle(page, groupId)
    await page.goto(`${BASE}/admin/programi`)
    await page
      .locator('a[href^="/admin/programi/"]', { hasText: courseTitle })
      .first()
      .click()
    await page.waitForURL(/\/admin\/programi\/[^/?#]+$/, { timeout: 15000 })
    const courseId = page.url().match(/\/admin\/programi\/([^/?#]+)/)![1]

    seeded = {
      teacher: { email: TEACHER.email, password: t.password },
      student: { email: `${s.username}@student.inovatic.local`, password: s.password },
      groupId,
      courseId,
      courseTitle,
    }
    await page.close()
  })

  test('admin adds program-wide (COURSE) + RoboCamp materials on the program detail page', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    test.setTimeout(120000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/programi/${seeded.courseId}`)

    // The first "Dodaj" on the page is the "Materijali za cijeli program" (COURSE) one.
    await addLinkMaterial(page, /^Dodaj$/, PROGRAM_LINK_TITLE, 'https://example.com/program-wide')
    await addRobocampMaterial(page, ROBOCAMP_TITLE, 'https://elearning.robocamp.eu/course/e2e')

    await expect(page.getByText(PROGRAM_LINK_TITLE)).toBeVisible()
    await expect(page.getByText(ROBOCAMP_TITLE)).toBeVisible()
  })

  test('student sees the RoboCamp guide up front and the rest in one flat list', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)

    // The guide gets its own card above everything else. This one is attached
    // at COURSE scope, which the old featured-set (module scope only) dropped.
    await expect(page.getByText('Interaktivni vodič').first()).toBeVisible()
    await expect(page.getByText(ROBOCAMP_TITLE)).toBeVisible()

    // Everything else is one list. Where a material came from is no longer
    // shown to a child, so the old scope headings must be gone.
    await expect(page.getByRole('heading', { name: 'Dodatni materijali' })).toBeVisible()
    await expect(page.getByText(PROGRAM_LINK_TITLE)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Za cijeli program' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Materijali grupe' })).toHaveCount(0)
  })

  test('the three panels are tabs on one group page', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)

    await page.getByRole('link', { name: 'Galerija' }).click()
    await page.waitForURL(/\/galerija$/, { timeout: 30000 })
    // The heading belongs to the layout, so it survives the tab switch.
    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toBeVisible()

    await page.getByRole('link', { name: 'Evaluacija' }).click()
    await page.waitForURL(/\/evaluacija$/, { timeout: 30000 })
    await expect(page.getByRole('heading', { name: seeded.courseTitle })).toBeVisible()
  })

  test('teacher Materijali tab presents the guide instead of previewing it', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // The student-preview mode is gone; the list is the whole tab.
    await expect(page.getByRole('button', { name: 'Pregled (učenik)' })).toHaveCount(0)

    const present = page.getByRole('link', { name: 'Prezentiraj interaktivni vodič' })
    await expect(present).toBeVisible()
    await present.click()
    await page.waitForURL(/\/nastavnik\/prezentacija\//, { timeout: 30000 })

    await expect(page.getByRole('button', { name: /Izađi/ })).toBeVisible()
    // Nothing on a projected screen may change a material — that absence is
    // the whole reason presenting is a separate surface.
    await expect(page.getByRole('button', { name: /Obriši|Uredi/ })).toHaveCount(0)
    await expect(page.getByText('Dodaj novi materijal')).toHaveCount(0)
  })
})
