import { test, expect, type Page } from '@playwright/test'
import { submitUntilUrl } from '../helpers/hydration'
import { db } from '@/lib/db'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — School-year planner (/admin/skolska-godina, planning mode)
// Uses a far-future school year (2030/2031) so the dev DB's current-year data
// doesn't interfere with the "empty state" precondition. Seeds 4 standard
// courses × 4 modules. No ScheduledGroups are needed — the planner is fully
// independent of group existence (groups are an attendance-side concern).
// Tests:
//   1. Empty-state shell: planner panel visible, no emerald cells, no summary
//   2. Live preview: typing a start date paints sessions + 28th ring + summary
//   3. Commit: "Dovrši plan" writes 16 ModuleSchedule rows + hides planner
// Requires: dev server on localhost:3000, seeded admin user.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
const ADMIN_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-8)

const SY = '2030/2031'
// Mon Sept 2, 2030 — picking a Monday so per-weekday assertions read cleanly.
const PLAN_START_DISPLAY = '02.09.2030'
const PLAN_START_ISO = '2030-09-02'
// 28th Mon = Mar 10, 2031.
const LAST_MON_KEY = '2031-03-10'

let seeded: {
  courseIds: string[]
  moduleIds: string[]
}

test.beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })

  const courseIds: string[] = []
  const moduleIds: string[] = []
  // 4 standard courses × 4 modules each — matches the planner's MODULE_COUNT.
  // No groups created — the planner intentionally doesn't depend on them.
  for (let c = 0; c < 4; c++) {
    const course = await db.course.create({
      data: {
        slug: `planner-course-${RUN_ID}-${c}`,
        title: `Planner Course ${RUN_ID}-${c}`,
        description: 'Test program za planiranje godine',
        isCustom: false,
        ageMin: 6,
        ageMax: 14,
      },
    })
    courseIds.push(course.id)
    for (let m = 0; m < 4; m++) {
      const mod = await db.courseModule.create({
        data: {
          courseId: course.id,
          title: `Modul ${m + 1} (${RUN_ID}-${c})`,
          sortOrder: m,
        },
      })
      moduleIds.push(mod.id)
    }
  }

  seeded = { courseIds, moduleIds }
})

test.beforeEach(async () => {
  // Each test starts from an empty plan for the future year so the planner is
  // visible — the previous "Dovrši plan" test leaves rows behind otherwise.
  // Wipe ALL standard-program rows for SY (including any from dev DB's SLR
  // seed if present), so the planner's empty-state precondition holds.
  await db.moduleSchedule.deleteMany({ where: { schoolYear: SY } })
})

test.afterAll(async () => {
  await db.moduleSchedule.deleteMany({ where: { schoolYear: SY } })
  await db.courseModule.deleteMany({ where: { id: { in: seeded.moduleIds } } })
  await db.course.deleteMany({ where: { id: { in: seeded.courseIds } } })
})

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('#identifier').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await submitUntilUrl(page, page.locator('button[type="submit"]'), `${BASE}/admin`)
  await page.waitForLoadState('networkidle')
}

async function setSchoolYearCookie(page: Page) {
  // School-year cookie is path-scoped to /admin. Set it before any navigation
  // so the planner page renders against SY 2030/2031 instead of the live one.
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

test.describe('/admin/skolska-godina — planning mode', () => {
  test('empty year shows the planner panel and hides the summary', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await setSchoolYearCookie(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    // Planner panel visible.
    await expect(page.getByRole('heading', { name: /Planiraj školsku godinu/ })).toBeVisible()
    await expect(page.locator('#planner-start-date')).toBeVisible()
    // Summary section hidden (no module dates committed yet).
    await expect(page.getByRole('heading', { name: /Završeci grupa po danima/ })).toBeHidden()
    // No calendar cell should claim session status before a start date is typed.
    expect(await page.locator('button[data-session="true"]').count()).toBe(0)
  })

  test('typing a start date paints sessions, rings the 28th, and shows the summary', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await setSchoolYearCookie(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    await page.locator('#planner-start-date').fill(PLAN_START_DISPLAY)
    // Preview list renders 4 module windows.
    await expect(page.getByText(/Pregled rasporeda modula/)).toBeVisible()
    for (let i = 1; i <= 4; i++) {
      await expect(page.getByText(new RegExp(`Modul ${i}`))).toBeVisible()
    }

    // First Monday session (Sept 2, 2030) painted as emerald.
    const firstMon = page.locator(`button[data-date="${PLAN_START_ISO}"][data-in-month="true"]`)
    await expect(firstMon).toHaveAttribute('data-session', 'true')

    // 28th Monday gets the last-session ring.
    const lastMon = page.locator(`button[data-date="${LAST_MON_KEY}"][data-in-month="true"]`)
    await expect(lastMon).toHaveAttribute('data-last-session', 'true')

    // Per-weekday module markers — Monday's "Modul 1 — početak" on Sept 2.
    const monMarker = firstMon
    const title = await monMarker.getAttribute('title')
    expect(title).toMatch(/Modul 1/)
    expect(title).toMatch(/početak/)
    expect(title).toMatch(/Pon/)

    // Module 1 START chip on the first Monday — text should read "M1" (the
    // marker uses array position, not raw sortOrder, so seed-style 1..4
    // sortOrder produces M1 not M2).
    const m1StartChip = firstMon.locator('span[aria-label="Modul 1 početak"]')
    await expect(m1StartChip).toBeVisible()
    await expect(m1StartChip).toContainText('M1')

    // Summary table now visible (driven by the preview).
    await expect(page.getByRole('heading', { name: /Završeci grupa po danima/ })).toBeVisible()
  })

  test('clicking Dovrši plan persists dates and hides the planner', async ({ page }) => {
    test.setTimeout(60000)
    await loginAsAdmin(page)
    await setSchoolYearCookie(page)
    await page.goto(`${BASE}/admin/skolska-godina`)

    await page.locator('#planner-start-date').fill(PLAN_START_DISPLAY)
    await page.getByRole('button', { name: /Dovrši plan/ }).click()

    // Toast appears, then the planner disappears once router.refresh() resolves.
    await expect(page.getByText(/Plan školske godine spremljen/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /Planiraj školsku godinu/ })).toBeHidden()
    // Summary remains visible.
    await expect(page.getByRole('heading', { name: /Završeci grupa po danima/ })).toBeVisible()

    // DB side: 16 ModuleSchedule rows for OUR 4 test courses (the dev DB's
    // real SLR seed gets written to as well — we don't care about it here,
    // afterAll cleans the SY slate either way).
    const count = await db.moduleSchedule.count({
      where: { schoolYear: SY, moduleId: { in: seeded.moduleIds } },
    })
    expect(count).toBe(16)
    // All 4 of our standard courses share the same Module 1 dates.
    const m1Rows = await db.moduleSchedule.findMany({
      where: {
        schoolYear: SY,
        module: { sortOrder: 0, courseId: { in: seeded.courseIds } },
      },
    })
    const m1Keys = new Set(
      m1Rows.map((r) => `${r.startDate?.toISOString()}|${r.endDate?.toISOString()}`),
    )
    expect(m1Keys.size).toBe(1)
  })
})
