import { test, expect, type Page } from '@playwright/test'
import { submitUntilUrl } from '../helpers/hydration'
import { db } from '@/lib/db'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Radionica date-range groups on the school-year calendar.
// Seeds a radionica Course + ScheduledGroup with [dateStart, dateEnd], navigates
// to /admin/skolska-godina, and asserts the workshop name appears on every day
// in the range (rose styling + per-cell label).
// Uses a far-future school year so the dev DB's real data doesn't interfere.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-8)
const SY = '2030/2031'
const WORKSHOP_TITLE = `Ljetna robotika ${RUN_ID}`
// 3-day range in October (well inside school year SY) — easy to assert.
const RANGE_KEYS = ['2030-10-13', '2030-10-14', '2030-10-15'] as const

let seeded: { courseId: string; groupId: string; locationId: string }

test.beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })

  const location = await db.location.create({
    data: { name: `Loc ${RUN_ID}`, address: `Test address ${RUN_ID}` },
  })
  const course = await db.course.create({
    data: {
      slug: `radionica-${RUN_ID}`,
      title: WORKSHOP_TITLE,
      description: 'Test radionica',
      isCustom: true,
      schoolYear: SY,
      ageMin: 6,
      ageMax: 14,
    },
  })
  const group = await db.scheduledGroup.create({
    data: {
      courseId: course.id,
      locationId: location.id,
      name: `Grupa ${RUN_ID}`,
      schoolYear: SY,
      dateStart: RANGE_KEYS[0],
      dateEnd: RANGE_KEYS[RANGE_KEYS.length - 1],
      startTime: '09:00',
      endTime: '11:00',
      maxStudents: 12,
    },
  })
  seeded = { courseId: course.id, groupId: group.id, locationId: location.id }
})

test.afterAll(async () => {
  await db.scheduledGroup.deleteMany({ where: { id: seeded.groupId } })
  await db.course.deleteMany({ where: { id: seeded.courseId } })
  await db.location.deleteMany({ where: { id: seeded.locationId } })
})

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
  await page.waitForLoadState('networkidle')
}

async function setSchoolYearCookie(page: Page) {
  await page.context().addCookies([
    {
      name: 'inovatic_school_year',
      value: SY,
      domain: 'localhost',
      path: '/admin',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

test.describe('/admin/skolska-godina — radionica labels', () => {
  test('renders the workshop name on every day in the radionica date range', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await setSchoolYearCookie(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    for (const key of RANGE_KEYS) {
      const cell = page.locator(`button[data-date="${key}"][data-in-month="true"]`)
      await expect(cell).toBeVisible()
      const labels = cell.locator('[data-testid="workshop-labels"]')
      await expect(labels).toContainText(WORKSHOP_TITLE)
    }

    // A day just outside the range should not carry the label.
    const outside = page.locator('button[data-date="2030-10-12"][data-in-month="true"]')
    await expect(outside).toBeVisible()
    await expect(outside.locator('[data-testid="workshop-labels"]')).toHaveCount(0)
  })

  test('legend includes a Radionica entry', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await setSchoolYearCookie(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    await expect(page.getByText(/Radionica \(cijeli dan\)/)).toBeVisible()
  })
})
