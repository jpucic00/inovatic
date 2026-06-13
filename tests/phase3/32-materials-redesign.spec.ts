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

const RUN_ID = Date.now().toString().slice(-6)

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

  test('student sees the program-wide material and the RoboCamp tutorial featured', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.student.email, seeded.student.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/portal/grupa/${seeded.groupId}`)

    await expect(page.getByText('Za cijeli program')).toBeVisible()
    await expect(page.getByText(PROGRAM_LINK_TITLE)).toBeVisible()
    // RoboCamp is surfaced under the "Interaktivni vodiči" heading.
    await expect(page.getByText('Interaktivni vodiči').first()).toBeVisible()
    await expect(page.getByText(ROBOCAMP_TITLE)).toBeVisible()
  })

  test('teacher Materijali tab — "Pregled (učenik)" shows the student-facing view', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}/materijali`)

    // Switch from management to the student-preview within the merged tab.
    await page.getByRole('button', { name: 'Pregled (učenik)' }).click()
    await expect(page.getByText('Ovako učenici vide materijale', { exact: false })).toBeVisible()

    // Program-wide LINK + RoboCamp render in the "Za cijeli program" section.
    // Scope to that section so we don't match the (hidden) management list copy.
    const programSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Za cijeli program' }),
    })
    await expect(programSection.getByText(PROGRAM_LINK_TITLE)).toBeVisible()
    await expect(programSection.getByText(ROBOCAMP_TITLE)).toBeVisible()
  })
})
