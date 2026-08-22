import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { loginAsAdmin, loginWithEmail } from '../helpers/phase3'

import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Admin list filters survive leaving the list.
//
// The URL is the source of truth; `sessionStorage` only fills it back in. What
// is worth a browser for is exactly the part the unit tier cannot see:
//  - the back link is upgraded client-side, so it must carry the filter without
//    a hydration mismatch and without the list flashing unfiltered first
//  - the restore must fire on arrival but never undo a deliberate clear, which
//    turns on the component surviving a same-route client navigation
//  - /admin/grupe's chip must reach the URL, or browser Back cannot restore it
//  - the memory is keyed on the admin id, which is what makes a relogin reset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'

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
const CY = computeSchoolYear()
// Unique enough that `?search=` returns this spec's student and nothing else,
// however much data the dev DB has accumulated.
const MARKER = `FilterMem${RUN_ID}`
const OTHER_ADMIN_EMAIL = `filtermem-admin-${RUN_ID}@test.local`
const OTHER_ADMIN_PASSWORD = 'admin123'

let seeded: {
  courseId: string
  groupId: string
  locationId: string
  studentId: string
  otherAdminId: string
}

test.beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: CY }, create: { label: CY }, update: {} })

  const location = await db.location.create({
    data: { city: 'SPLIT', name: `Loc ${RUN_ID}`, address: `Test address ${RUN_ID}` },
  })
  // SLR_2 so the board renders an "SLR 2" chip to click. The level is not
  // unique, so this coexists with the real catalog.
  const course = await db.course.create({
    data: {
      slug: `filtermem-course-${RUN_ID}`,
      title: `Program ${RUN_ID}`,
      description: 'Test program',
      kind: 'STANDARD',
      level: 'SLR_2',
      ageMin: 6,
      ageMax: 14,
    },
  })
  const group = await db.scheduledGroup.create({
    data: {
      city: 'SPLIT',
      courseId: course.id,
      locationId: location.id,
      name: `Grupa ${MARKER}`,
      schoolYear: CY,
      dayOfWeek: 'Srijeda',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
    },
  })
  const student = await db.user.create({
    data: {
      city: 'SPLIT',
      email: `filtermem-${RUN_ID}@test.local`,
      username: `filtermem_${RUN_ID}`,
      firstName: 'Filter',
      lastName: MARKER,
      passwordHash: 'x',
      role: 'STUDENT',
    },
  })
  const otherAdmin = await db.user.create({
    data: {
      city: 'SPLIT',
      email: OTHER_ADMIN_EMAIL,
      username: `filtermem_admin_${RUN_ID}`,
      firstName: 'Drugi',
      lastName: `Admin ${RUN_ID}`,
      passwordHash: await bcrypt.hash(OTHER_ADMIN_PASSWORD, 4),
      role: 'ADMIN',
    },
  })

  seeded = {
    courseId: course.id,
    groupId: group.id,
    locationId: location.id,
    studentId: student.id,
    otherAdminId: otherAdmin.id,
  }
})

test.afterAll(async () => {
  if (!seeded) return
  await db.user.deleteMany({ where: { id: { in: [seeded.studentId, seeded.otherAdminId] } } })
  await db.scheduledGroup.deleteMany({ where: { id: seeded.groupId } })
  await db.course.deleteMany({ where: { id: seeded.courseId } })
  await db.location.deleteMany({ where: { id: seeded.locationId } })
})

const filterBar = (page: Page) => page.getByText('Filter aktivan:')

/**
 * A restored filter costs a client effect, a `router.replace` and a fresh
 * server render. Against a dev server that has been compiling for the whole
 * suite that outruns Playwright's 5s default, so every URL that arrives by way
 * of the memory waits explicitly rather than racing it.
 */
const RESTORE_TIMEOUT = 20000

/** Lands on the students list already narrowed to this spec's one student. */
async function gotoFilteredStudents(page: Page) {
  await page.goto(`${BASE}/admin/ucenici?search=${MARKER}`)
  await expect(page.getByRole('cell', { name: `Filter ${MARKER}` })).toBeVisible({
    timeout: RESTORE_TIMEOUT,
  })
  await expect(filterBar(page)).toBeVisible({ timeout: RESTORE_TIMEOUT })
}

test.describe('admin list filters survive leaving the list', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('the back link on a student returns to the filtered list', async ({ page }) => {
    await gotoFilteredStudents(page)

    await page.getByRole('link', { name: 'Detalji' }).first().click()
    await page.waitForURL(/\/admin\/ucenici\/[^/?]+$/, { timeout: RESTORE_TIMEOUT })

    const back = page.getByRole('link', { name: 'Natrag na učenike' })
    // The href is bare in the server HTML and upgraded in an effect, so assert
    // on the attribute: a passing click alone would not prove the filter came
    // from the link rather than from the list restoring after the fact.
    await expect(back).toHaveAttribute('href', `/admin/ucenici?search=${MARKER}`, {
      timeout: RESTORE_TIMEOUT,
    })

    await back.click()
    await page.waitForURL(`${BASE}/admin/ucenici?search=${MARKER}`, {
      timeout: RESTORE_TIMEOUT,
    })
    await expect(page.getByRole('cell', { name: `Filter ${MARKER}` })).toBeVisible({
      timeout: RESTORE_TIMEOUT,
    })
  })

  test('coming back through the sidebar restores the filter', async ({ page }) => {
    await gotoFilteredStudents(page)

    // Both sidebar links point at the bare path — this is the cold-arrival path.
    await page.getByRole('link', { name: 'Grupe', exact: true }).first().click()
    await page.waitForURL(/\/admin\/grupe$/, { timeout: RESTORE_TIMEOUT })

    await page.getByRole('link', { name: 'Učenici', exact: true }).first().click()
    await page.waitForURL(`${BASE}/admin/ucenici?search=${MARKER}`, {
      timeout: RESTORE_TIMEOUT,
    })
    await expect(filterBar(page)).toBeVisible({ timeout: RESTORE_TIMEOUT })
  })

  test('a deliberate clear is not undone by the memory', async ({ page }) => {
    await gotoFilteredStudents(page)

    await page.getByRole('button', { name: 'Očisti sve' }).click()
    await expect(page).toHaveURL(`${BASE}/admin/ucenici`, { timeout: RESTORE_TIMEOUT })
    await expect(filterBar(page)).toBeHidden({ timeout: RESTORE_TIMEOUT })

    // The clear has to be recorded, not merely navigated to: a reload remounts
    // the component, and an unrecorded clear would let the old filter return.
    // Settling first, because that restore would land just after hydration —
    // asserting straight away could read the URL before it was undone.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(`${BASE}/admin/ucenici`)
    await expect(filterBar(page)).toBeHidden()
  })

  test('removing one chip keeps the rest of the filter', async ({ page }) => {
    await page.goto(`${BASE}/admin/ucenici?search=${MARKER}&payment=PENDING`)
    await expect(filterBar(page)).toBeVisible({ timeout: RESTORE_TIMEOUT })

    await page.getByRole('button', { name: 'Ukloni filter: Nije plaćeno' }).click()
    await page.waitForURL(`${BASE}/admin/ucenici?search=${MARKER}`, {
      timeout: RESTORE_TIMEOUT,
    })
    await expect(filterBar(page)).toBeVisible({ timeout: RESTORE_TIMEOUT })
  })

  test('the grupe chip reaches the URL, so Back restores it', async ({ page }) => {
    await page.goto(`${BASE}/admin/grupe`)

    await page.getByRole('button', { name: /SLR 2/ }).click()
    await page.waitForURL(`${BASE}/admin/grupe?tab=SLR_2`, { timeout: RESTORE_TIMEOUT })

    const groupLink = page.getByRole('link', { name: `Grupa ${MARKER}` })
    await expect(groupLink).toBeVisible({ timeout: RESTORE_TIMEOUT })
    await groupLink.click()
    await page.waitForURL(/\/admin\/grupe\/[^/?]+$/, { timeout: RESTORE_TIMEOUT })

    // The selection used to live in React state alone, so this landed on
    // "Sve grupe" whichever program had been on screen.
    await page.goBack()
    await page.waitForURL(`${BASE}/admin/grupe?tab=SLR_2`, { timeout: RESTORE_TIMEOUT })
    await expect(page.getByRole('button', { name: 'Poništi filter' })).toBeVisible({
      timeout: RESTORE_TIMEOUT,
    })
  })

  test('another admin does not inherit the filter', async ({ page }) => {
    await gotoFilteredStudents(page)

    // Same tab, same origin: cookies are dropped but sessionStorage is not, so
    // only the admin id in the key keeps the two apart.
    await loginWithEmail(page, OTHER_ADMIN_EMAIL, OTHER_ADMIN_PASSWORD)

    await page.goto(`${BASE}/admin/ucenici`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(`${BASE}/admin/ucenici`)
    await expect(filterBar(page)).toBeHidden()
  })
})
