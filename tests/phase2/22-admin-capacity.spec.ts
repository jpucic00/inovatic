import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin as sharedLoginAsAdmin } from '../helpers/phase3'
import { db } from '@/lib/db'

import { cleanupRunFixtures } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Admin enrolment capacity display + hard-block guardrail.
// Pre-seeds (via direct Prisma) a radionica + group with maxStudents=1 that's
// already filled, then opens the two enrolment dialogs and verifies the
// full-group row renders the "Popunjeno" chip, its radio is disabled, and
// the submit button stays disabled even after a (denied) click.
// Requires: dev server on localhost:3000, seeded admin user (jpucic00@…).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'

const RUN_ID = Date.now().toString().slice(-8)

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

let seeded: {
  courseId: string
  fullGroupId: string
  fullGroupLabel: string
  spareStudentId: string
  inquiryId: string
}

test.beforeAll(async () => {
  const location = await db.location.create({
    data: {
      city: 'SPLIT',
      name: `Capacity Lokacija ${RUN_ID}`,
      address: `Test ulica ${RUN_ID}`,
    },
  })
  // Both the course and its group must live in the current school year.
  // getCourses() (which feeds the AddEnrollmentDialog program dropdown on
  // /admin/ucenici/[id]) filters radionice by schoolYear via the admin
  // cookie (default = current year). getGroupsForCourse / *InSelectedYear
  // (which feed CreateAccountDialog + AddEnrollmentDialog group lists) also
  // scope by the cookie year. A null-schoolYear radionica is therefore
  // invisible to either flow.
  const currentSchoolYear = (() => {
    const now = new Date()
    const y = now.getFullYear()
    return now.getMonth() + 1 >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
  })()
  const course = await db.course.create({
    data: {
      slug: `capacity-radionica-${RUN_ID}`,
      title: `Capacity Radionica ${RUN_ID}`,
      description: 'Test radionica',
      kind: 'RADIONICA',
      schoolYear: currentSchoolYear,
      ageMin: 6,
      ageMax: 14,
    },
  })
  const group = await db.scheduledGroup.create({
    data: {
      city: 'SPLIT',
      courseId: course.id,
      locationId: location.id,
      name: `Capacity Grupa ${RUN_ID}`,
      schoolYear: currentSchoolYear,
      maxStudents: 1,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
    },
  })

  // Fill the single seat
  const sittingStudent = await db.user.create({
    data: {
      city: 'SPLIT',
      email: `sitting-${RUN_ID}@student.inovatic.local`,
      username: `sitting${RUN_ID}`,
      firstName: 'Sjedi',
      lastName: `Tu${RUN_ID}`,
      passwordHash: 'x',
      role: 'STUDENT',
    },
  })
  await db.enrollment.create({
    data: {
      userId: sittingStudent.id,
      scheduledGroupId: group.id,
      schoolYear: group.schoolYear,
    },
  })

  // Spare student (not enrolled) so the admin "Upiši u novu grupu" dialog
  // has someone to try to add into the full group.
  const spareStudent = await db.user.create({
    data: {
      city: 'SPLIT',
      email: `spare-${RUN_ID}@student.inovatic.local`,
      username: `spare${RUN_ID}`,
      firstName: 'Slobodni',
      lastName: `Učenik${RUN_ID}`,
      passwordHash: 'x',
      role: 'STUDENT',
    },
  })

  // Inquiry rendered on /admin/upiti/[id] — preferred course is our radionica
  // so the CreateAccountDialog opens with this course preselected.
  const inquiry = await db.inquiry.create({
    data: {
      city: 'SPLIT',
      parentName: `Capacity Roditelj ${RUN_ID}`,
      parentEmail: `capacity.parent.${RUN_ID}@test.com`,
      parentPhone: `099000${RUN_ID}`,
      childFirstName: 'Novo',
      childLastName: `Dijete${RUN_ID}`,
      childDateOfBirth: '2015-04-01',
      consentGivenAt: new Date(),
      courseId: course.id,
      status: 'NEW',
    },
  })

  seeded = {
    courseId: course.id,
    fullGroupId: group.id,
    fullGroupLabel: group.name ?? `Capacity Grupa ${RUN_ID}`,
    spareStudentId: spareStudent.id,
    inquiryId: inquiry.id,
  }
})

test.afterAll(async () => {
  // Best-effort cleanup so leftover test data doesn't bloat dev DB.
  await db.inquiry.deleteMany({ where: { id: seeded.inquiryId } })
  await db.enrollment.deleteMany({ where: { scheduledGroupId: seeded.fullGroupId } })
  await db.scheduledGroup.deleteMany({ where: { id: seeded.fullGroupId } })
  await db.user.deleteMany({
    where: { OR: [{ id: seeded.spareStudentId }, { firstName: 'Sjedi', lastName: `Tu${RUN_ID}` }] },
  })
  await db.course.deleteMany({ where: { id: seeded.courseId } })
  // Location stays — it's an FK target for any leftover row; deleting last is risky.
})

// Delegates to the shared panel-aware helper: the seeded admin can hold a
// TeacherAssignment, which turns login into the dual-role panel chooser —
// driving the form here and waiting for /admin hangs on a login that
// actually SUCCEEDED (see .claude/validate.md decisions log, 2026-07-27).
async function loginAsAdmin(page: Page) {
  await sharedLoginAsAdmin(page)
  await page.waitForLoadState('networkidle')
}

test.describe('Admin enrolment dialogs — capacity guardrail', () => {
  test('Upiši u novu grupu: full group has Popunjeno chip, radio disabled, submit stays disabled', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/ucenici/${seeded.spareStudentId}`)
    await page.getByRole('button', { name: /Upiši u novu grupu/i }).click()

    // Select our radionica from the program <select>
    await page.locator('select#add-enrollment-course').selectOption({ label: `Capacity Radionica ${RUN_ID}` })

    // The full group's row should render the Popunjeno chip
    const fullRow = page.locator('label').filter({ hasText: seeded.fullGroupLabel })
    await expect(fullRow).toContainText('Popunjeno')

    // Its radio should be disabled
    const radio = fullRow.locator('input[type="radio"]')
    await expect(radio).toBeDisabled()

    // Try to click it anyway — handleGroupSelect blocks selection, so selectedGroupId
    // stays empty and the submit button stays disabled.
    await radio.click({ force: true }).catch(() => {})
    const submit = page.getByRole('button', { name: /^Upiši$/i })
    await expect(submit).toBeDisabled()
  })

  test('Kreiraj račun iz upita: full group has Popunjeno chip, radio disabled', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/upiti/${seeded.inquiryId}`)
    await page.getByRole('button', { name: /Kreiraj račun i upiši/i }).click()

    // Course is preselected from the inquiry; groups should auto-load.
    const fullRow = page.locator('label').filter({ hasText: seeded.fullGroupLabel })
    await expect(fullRow).toContainText('Popunjeno')

    const radio = fullRow.locator('input[type="radio"]')
    await expect(radio).toBeDisabled()

    const submit = page.getByRole('button', { name: /Kreiraj račun i upiši/i }).last()
    await expect(submit).toBeDisabled()
  })
})
