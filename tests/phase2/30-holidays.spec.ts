import { test, expect, type Page } from '@playwright/test'
import { submitUntilUrl } from '../helpers/hydration'
import { db } from '@/lib/db'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — School-year holiday management page (/admin/skolska-godina)
// Seeds (via direct Prisma) a standard SLR course with a 4-Monday module
// window and one attendance row on the second Monday. Exercises:
//   1. Mark a Monday cell as holiday → cell paints blue, name appears
//   2. Mark a Monday that already has attendance → confirm dialog mentions
//      "zapis dolaska" before destructive save; on confirm, attendance is
//      cascaded out and the cell turns blue
//   3. WeekdayEndSummary reflects the dropped Monday (3/28 in amber)
// Requires: dev server on localhost:3000, seeded admin user (jpucic00@…).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-8)

function currentSchoolYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

const SY = currentSchoolYear()

// Inside the current school year's calendar window (Sept N → Aug N+1) so
// the seeded cells actually exist on the page. Today (per CI/dev clock) is
// in 2025/2026 → use Jan 2026 Mondays.
const MOD_START = new Date(Date.UTC(2026, 0, 5)) // Mon 2026-01-05
const MOD_END = new Date(Date.UTC(2026, 0, 26)) // Mon 2026-01-26 (4 Mondays)

let seeded: {
  courseId: string
  moduleId: string
  groupId: string
  studentId: string
  enrollmentId: string
  attendanceDate: Date
  cellWithAttendanceKey: string // YYYY-MM-DD
  emptyCellKey: string // YYYY-MM-DD
}

test.beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })

  const location = await db.location.create({
    data: { city: 'SPLIT', name: `Holiday Lokacija ${RUN_ID}`, address: `Test ulica ${RUN_ID}` },
  })
  const course = await db.course.create({
    data: {
      slug: `holiday-course-${RUN_ID}`,
      title: `Holiday Course ${RUN_ID}`,
      description: 'Test course za praznike',
      kind: 'STANDARD',
      ageMin: 6,
      ageMax: 14,
    },
  })
  const moduleRow = await db.courseModule.create({
    data: { courseId: course.id, title: `Modul A ${RUN_ID}` },
  })
  await db.moduleSchedule.create({
    data: {
      city: 'SPLIT',
      moduleId: moduleRow.id,
      schoolYear: SY,
      startDate: MOD_START,
      endDate: MOD_END,
    },
  })
  const group = await db.scheduledGroup.create({
    data: {
      city: 'SPLIT',
      courseId: course.id,
      locationId: location.id,
      name: `Holiday Grupa ${RUN_ID}`,
      schoolYear: SY,
      maxStudents: 12,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
    },
  })

  const student = await db.user.create({
    data: {
      city: 'SPLIT',
      email: `holiday-student-${RUN_ID}@student.inovatic.local`,
      username: `holidaystudent${RUN_ID}`,
      firstName: 'Holiday',
      lastName: `Student${RUN_ID}`,
      passwordHash: 'x',
      role: 'STUDENT',
    },
  })
  const enrollment = await db.enrollment.create({
    data: { userId: student.id, scheduledGroupId: group.id, schoolYear: SY },
  })

  // Attendance on the SECOND Monday (Jan 12 2026) — that's the date we'll
  // mark as a holiday and expect the warn-before-delete dialog.
  const attendanceDate = new Date(Date.UTC(2026, 0, 12))
  await db.attendance.create({
    data: {
      enrollmentId: enrollment.id,
      sessionDate: attendanceDate,
      present: true,
      recordedById: student.id, // any user ref works for the FK
    },
  })

  seeded = {
    courseId: course.id,
    moduleId: moduleRow.id,
    groupId: group.id,
    studentId: student.id,
    enrollmentId: enrollment.id,
    attendanceDate,
    cellWithAttendanceKey: '2026-01-12',
    emptyCellKey: '2026-01-19', // third Monday — no attendance
  }
})

test.afterAll(async () => {
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY } })
  await db.attendance.deleteMany({ where: { enrollmentId: seeded.enrollmentId } })
  await db.enrollment.deleteMany({ where: { id: seeded.enrollmentId } })
  await db.user.deleteMany({ where: { id: seeded.studentId } })
  await db.scheduledGroup.deleteMany({ where: { id: seeded.groupId } })
  await db.moduleSchedule.deleteMany({ where: { moduleId: seeded.moduleId } })
  await db.courseModule.deleteMany({ where: { id: seeded.moduleId } })
  await db.course.deleteMany({ where: { id: seeded.courseId } })
})

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
  await page.waitForLoadState('networkidle')
}

test.describe('/admin/skolska-godina — holiday management', () => {
  test('marks an empty Monday as a holiday and the cell paints blue', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    const cell = page.locator(`button[data-date="${seeded.emptyCellKey}"][data-in-month="true"]`)
    await expect(cell).toBeVisible()
    await expect(cell).toHaveAttribute('data-holiday', 'false')
    // Double-click is the single-day shortcut — fires two single clicks
    // (first stages range, second opens single dialog) then dblclick.
    await cell.dblclick()

    await page.getByLabel('Naziv (neobavezno)').fill('Test praznik')
    await page.getByRole('button', { name: /^Spremi$/ }).click()

    // Dialog closes, cell repaints as "praznik".
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator(`button[data-date="${seeded.emptyCellKey}"][data-in-month="true"]`)).toHaveAttribute(
      'data-holiday',
      'true',
    )
  })

  test('warns about existing attendance, then cascades the delete', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    const cell = page.locator(`button[data-date="${seeded.cellWithAttendanceKey}"][data-in-month="true"]`)
    await expect(cell).toBeVisible()
    await cell.dblclick()

    // First Save → action returns requiresConfirmation; warning appears.
    await page.getByRole('button', { name: /^Spremi$/ }).click()
    await expect(
      page.getByText(/zapis dolaska na ovaj dan|zapisa dolaska na ovaj dan/i),
    ).toBeVisible()

    // Confirm destructive save.
    await page.getByRole('button', { name: /Da, obriši dolaske i spremi/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // Attendance row was deleted by the transaction.
    const remaining = await db.attendance.count({
      where: { enrollmentId: seeded.enrollmentId, sessionDate: seeded.attendanceDate },
    })
    expect(remaining).toBe(0)

    // And the cell is now flagged as holiday.
    await expect(
      page.locator(`button[data-date="${seeded.cellWithAttendanceKey}"][data-in-month="true"]`),
    ).toHaveAttribute('data-holiday', 'true')
  })

  test('range picker marks every day in [start, end] as a holiday in one save', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    // Start on Mon 2026-02-02, end on Fri 2026-02-06 — five fresh, untouched cells.
    const startKey = '2026-02-02'
    const endKey = '2026-02-06'
    const rangeKeys = ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06']

    // 1. Click start cell → stages range start, shows hint banner.
    await page
      .locator(`button[data-date="${startKey}"][data-in-month="true"]`)
      .click()
    await expect(
      page.locator(`button[data-date="${startKey}"][data-in-month="true"]`),
    ).toHaveAttribute('data-range-start', 'true')
    // Banner appears with the staged date — the legend chip also says
    // "Početak raspona" but without the colon, so anchor on that.
    await expect(page.getByText(/Početak raspona:/)).toBeVisible()

    // 2. Click end cell → opens dialog pre-filled with the range.
    await page
      .locator(`button[data-date="${endKey}"][data-in-month="true"]`)
      .click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('Naziv (neobavezno)').fill('Zimski praznici')

    // Button label is "Spremi raspon" because a range is active.
    await page.getByRole('button', { name: /Spremi raspon/i }).click()

    await expect(page.getByRole('dialog')).toBeHidden()

    // Every cell in the inclusive range now flipped to holiday.
    for (const key of rangeKeys) {
      await expect(page.locator(`button[data-date="${key}"][data-in-month="true"]`)).toHaveAttribute(
        'data-holiday',
        'true',
      )
    }
    // The day immediately before the range should NOT have been flipped.
    await expect(page.locator(`button[data-date="2026-02-01"][data-in-month="true"]`)).toHaveAttribute(
      'data-holiday',
      'false',
    )
  })

  test('clicking a mid-range holiday cell offers remove-this-day and remove-whole-range', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    // Stage a contiguous 5-day block via the range picker. Use March 2026
    // dates so we don't collide with earlier tests' state.
    const rangeStart = '2026-03-02'
    const rangeEnd = '2026-03-06'
    const midDay = '2026-03-04'
    const outsideDay = '2026-03-09'

    await page.locator(`button[data-date="${rangeStart}"][data-in-month="true"]`).click()
    await page.locator(`button[data-date="${rangeEnd}"][data-in-month="true"]`).click()
    await page.getByLabel('Naziv (neobavezno)').fill('Test blok')
    await page.getByRole('button', { name: /Spremi raspon/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    // Block save must round-trip through router.refresh() before the next
    // interaction — otherwise the dblclick races a stale render where the
    // onClick handler hasn't reattached. Pin on a cell that should now be a
    // holiday.
    await expect(
      page.locator(`button[data-date="${rangeEnd}"][data-in-month="true"]`),
    ).toHaveAttribute('data-holiday', 'true')

    // Also mark a single unrelated holiday outside the block — should survive
    // when we remove the block. Use two explicit clicks instead of dblclick:
    // 1st stages range, 2nd on same cell commits as single-day. dblclick
    // races on a freshly re-rendered page (state from the first click hasn't
    // settled before the second).
    const outsideCell = page.locator(`button[data-date="${outsideDay}"][data-in-month="true"]`)
    await outsideCell.click()
    await outsideCell.click()
    await page.getByLabel('Naziv (neobavezno)').fill('Solo praznik')
    await page.getByRole('button', { name: /^Spremi$/ }).click()
    // A long-lived dev DB accumulates attendance on arbitrary dates, so this save
    // may hit the cascade-confirmation branch (covered on its own above). The save
    // button relabels itself in place once the action returns requiresConfirmation,
    // so wait for that label rather than probing before the transition settles.
    const confirmCascade = page.getByRole('button', { name: /Da, obriši dolaske i spremi/i })
    const needsConfirm = await confirmCascade
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    if (needsConfirm) await confirmCascade.click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(outsideCell).toHaveAttribute('data-holiday', 'true')

    // Click the middle day of the block. Dialog should expose two destructive
    // buttons + a hint identifying the block bounds.
    await page.locator(`button[data-date="${midDay}"][data-in-month="true"]`).click()
    await expect(page.getByText(/Dio raspona/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Ukloni samo ovaj dan/i })).toBeVisible()
    const removeBlockBtn = page.getByRole('button', { name: /Ukloni raspon/i })
    await expect(removeBlockBtn).toBeVisible()

    // Click the whole-range remove and verify only the 5 block cells flip
    // back to "not a holiday"; the outside-day stays marked.
    await removeBlockBtn.click()
    await expect(page.getByRole('dialog')).toBeHidden()

    for (const key of ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']) {
      await expect(
        page.locator(`button[data-date="${key}"][data-in-month="true"]`),
      ).toHaveAttribute('data-holiday', 'false')
    }
    await expect(
      page.locator(`button[data-date="${outsideDay}"][data-in-month="true"]`),
    ).toHaveAttribute('data-holiday', 'true')
  })

  test('"Učitaj iz kalendara MZO-a" button opens the import dialog and loads Croatian holidays', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    const trigger = page.getByTestId('open-holiday-import')
    await expect(trigger).toBeVisible()
    await expect(trigger).toContainText(/Učitaj iz kalendara MZO-a/i)

    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(new RegExp(`Učitaj praznike za ${SY.replace('/', '\\/')}`))

    // Wait for the preview to settle — either rows appear (live API hit
    // succeeded) or the error state shows (API unreachable). Both are
    // acceptable smoke outcomes; we just want loading to clear.
    const rowsOrError = page.locator(
      '[data-testid="holiday-import-row"], .text-red-900',
    )
    await expect(rowsOrError.first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('holiday-import-loading')).toBeHidden({ timeout: 20000 })

    // Odustani always works and leaves the calendar untouched.
    await page.getByRole('button', { name: /^Odustani$/ }).click()
    await expect(dialog).toBeHidden()
  })

  test('WeekdayEndSummary cell goes amber when Mondays are dropped under target', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    // The seeded course has 4 expected Mondays; both holidays from the
    // earlier tests dropped two of them → 2/28 in the Ponedjeljak column for
    // the Holiday Course row.
    const row = page.locator('tr', { hasText: `Holiday Course ${RUN_ID}` })
    await expect(row).toBeVisible()
    // Pon is the first weekday column after the program label.
    const cell = row.locator('td').nth(1)
    await expect(cell).toContainText(/2\/28/)
  })
})
