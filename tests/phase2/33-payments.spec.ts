import { test, expect, type Page } from '@playwright/test'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { submitUntilUrl } from '../helpers/hydration'
import { loginAsAdmin as sharedLoginAsAdmin } from '../helpers/phase3'
import { seedTeacher, seedTeacherAssignment } from '../helpers/seed'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Per-module payment tracking (admin).
// Seeds one PENDING student (unpaid started module) and one PAID student in the
// same current-year group, plus a teacher assigned to that group. Covers:
//  - detail-page module chip toggle round-trip
//  - whole-year-paid disables module chips + Poništi reverts
//  - list "Plaćanje" badge + ?payment=PENDING filter
//  - "Plaćanje" column sort puts debtors first
//  - teacher student page renders no payment UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'

const RUN_ID = Date.now().toString().slice(-8)
const CY = computeSchoolYear()
const MARKER = `PayTest${RUN_ID}`
const MODULE_TITLE = `Modul 1 ${RUN_ID}`
const STARTED = new Date(Date.now() - 30 * 24 * 3600 * 1000) // 30 days ago → started

let seeded: {
  courseId: string
  moduleId: string
  moduleScheduleId: string
  groupId: string
  locationId: string
  pendingStudentId: string
  pendingModuleEnrollmentId: string
  pendingEnrollmentId: string
  paidStudentId: string
  paidModuleEnrollmentId: string
  teacherId: string
  teacherEmail: string
  teacherPassword: string
}

test.beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: CY }, create: { label: CY }, update: {} })

  const location = await db.location.create({
    data: { city: 'SPLIT', name: `Loc ${RUN_ID}`, address: `Test address ${RUN_ID}` },
  })
  const course = await db.course.create({
    data: {
      slug: `pay-course-${RUN_ID}`,
      title: `Program ${RUN_ID}`,
      description: 'Test program',
      kind: 'STANDARD',
      ageMin: 6,
      ageMax: 14,
    },
  })
  const mod = await db.courseModule.create({
    data: { courseId: course.id, title: MODULE_TITLE, sortOrder: 0 },
  })
  const ms = await db.moduleSchedule.create({
    data: { city: 'SPLIT', moduleId: mod.id, schoolYear: CY, startDate: STARTED },
  })
  const group = await db.scheduledGroup.create({
    data: {
      city: 'SPLIT',
      courseId: course.id,
      locationId: location.id,
      name: `Grupa ${RUN_ID}`,
      schoolYear: CY,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
    },
  })

  async function seedStudent(suffix: string, paid: boolean) {
    const user = await db.user.create({
      data: {
        city: 'SPLIT',
        email: `pay-${suffix}-${RUN_ID}@test.local`,
        username: `pay_${suffix}_${RUN_ID}`,
        firstName: 'Pay',
        lastName: `${MARKER}_${suffix}`,
        passwordHash: 'x',
        role: 'STUDENT',
      },
    })
    const enrollment = await db.enrollment.create({
      data: { userId: user.id, scheduledGroupId: group.id, schoolYear: CY },
    })
    const me = await db.moduleEnrollment.create({
      data: {
        enrollmentId: enrollment.id,
        moduleScheduleId: ms.id,
        paidAt: paid ? new Date() : null,
      },
    })
    return { userId: user.id, enrollmentId: enrollment.id, moduleEnrollmentId: me.id }
  }

  const pending = await seedStudent('pending', false)
  const paid = await seedStudent('paid', true)

  const teacherEmail = `pay-teacher-${RUN_ID}@test.local`
  const { teacherId, password } = await seedTeacher({
    firstName: 'Pay',
    lastName: `Teacher ${RUN_ID}`,
    email: teacherEmail,
    phone: '+38591000000',
  })
  await seedTeacherAssignment(teacherId, group.id)

  seeded = {
    courseId: course.id,
    moduleId: mod.id,
    moduleScheduleId: ms.id,
    groupId: group.id,
    locationId: location.id,
    pendingStudentId: pending.userId,
    pendingModuleEnrollmentId: pending.moduleEnrollmentId,
    pendingEnrollmentId: pending.enrollmentId,
    paidStudentId: paid.userId,
    paidModuleEnrollmentId: paid.moduleEnrollmentId,
    teacherId,
    teacherEmail,
    teacherPassword: password,
  }
})

// Reset payment flags to the known baseline before every test so the chip-toggle
// test can't leak state into the list/sort/filter assertions (order-independent).
test.beforeEach(async () => {
  if (!seeded) return
  await db.enrollment.update({
    where: { id: seeded.pendingEnrollmentId },
    data: { fullYearPaidAt: null },
  })
  await db.moduleEnrollment.update({
    where: { id: seeded.pendingModuleEnrollmentId },
    data: { paidAt: null },
  })
  await db.moduleEnrollment.update({
    where: { id: seeded.paidModuleEnrollmentId },
    data: { paidAt: new Date() },
  })
})

test.afterAll(async () => {
  if (!seeded) return
  await db.user.deleteMany({
    where: { id: { in: [seeded.pendingStudentId, seeded.paidStudentId, seeded.teacherId] } },
  })
  await db.scheduledGroup.deleteMany({ where: { id: seeded.groupId } })
  await db.moduleSchedule.deleteMany({ where: { id: seeded.moduleScheduleId } })
  await db.courseModule.deleteMany({ where: { id: seeded.moduleId } })
  await db.course.deleteMany({ where: { id: seeded.courseId } })
  await db.location.deleteMany({ where: { id: seeded.locationId } })
})

// Delegates to the shared panel-aware helper: the seeded admin can hold a
// TeacherAssignment, which turns login into the dual-role panel chooser —
// driving the form here and waiting for /admin hangs on a login that
// actually SUCCEEDED (see .claude/validate.md decisions log, 2026-07-27).
async function loginAsAdmin(page: Page) {
  await sharedLoginAsAdmin(page)
  await page.waitForLoadState('domcontentloaded')
}

test.describe('payment tracking — student detail page', () => {
  test('marks a module paid and back to unpaid', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.pendingStudentId}`)

    const chip = page.getByRole('button', { name: MODULE_TITLE })
    await expect(chip).toBeVisible()
    // Starts unpaid.
    await expect(chip).toHaveAttribute('title', 'Označi kao plaćeno')

    await chip.click()
    await expect(page.getByRole('button', { name: MODULE_TITLE })).toHaveAttribute(
      'title',
      'Označi kao neplaćeno',
    )

    await page.getByRole('button', { name: MODULE_TITLE }).click()
    await expect(page.getByRole('button', { name: MODULE_TITLE })).toHaveAttribute(
      'title',
      'Označi kao plaćeno',
    )
  })

  test('whole-year-paid locks module chips and Poništi reverts', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.pendingStudentId}`)

    await page.getByRole('button', { name: 'Označi cijelu godinu plaćenom' }).click()

    // Module chip is now a locked (disabled) span, not a button.
    await expect(
      page.getByTitle('Pokriveno oznakom plaćene cijele godine'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: MODULE_TITLE })).toHaveCount(0)

    await page.getByRole('button', { name: 'Poništi' }).click()

    // Year mark cleared → the per-module toggle button is back.
    await expect(page.getByRole('button', { name: MODULE_TITLE })).toBeVisible()
  })
})

test.describe('payment tracking — students list', () => {
  test('shows the Plaćanje badge and filters to debtors', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici?search=${MARKER}&payment=PENDING`)

    // Pending student present with the red badge; paid student filtered out.
    // Scope the badge assertion to the table body so it doesn't match the
    // selected <option>Nije plaćeno</option> in the filter dropdown.
    await expect(page.getByText(`${MARKER}_pending`)).toBeVisible()
    await expect(page.getByText(`${MARKER}_paid`)).toHaveCount(0)
    await expect(page.locator('tbody').getByText('Nije plaćeno').first()).toBeVisible()
  })

  test('Plaćanje column sort puts debtors first', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici?search=${MARKER}`)

    // Both students visible before sorting.
    await expect(page.getByText(`${MARKER}_pending`)).toBeVisible()
    await expect(page.getByText(`${MARKER}_paid`)).toBeVisible()

    await page.getByRole('button', { name: 'Plaćanje' }).click()

    // Ascending sort → PENDING (sort key 0) first.
    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toContainText(`${MARKER}_pending`)
  })
})

test.describe('payment tracking — teacher view', () => {
  test('teacher student page renders no payment UI', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto(`${BASE}/prijava`)
    await page.locator('#identifier').fill(seeded.teacherEmail)
    await page.locator('input[type="password"]').fill(seeded.teacherPassword)
    await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/nastavnik`)
    await page.waitForLoadState('domcontentloaded')

    await page.goto(`${BASE}/nastavnik/ucenik/${seeded.pendingStudentId}`)

    // Read-only module list shows, but no payment heading or mark buttons.
    await expect(page.getByText('Plaćanje', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Označi/ })).toHaveCount(0)
  })
})
