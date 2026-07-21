import { test, expect, type Page } from '@playwright/test'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { loginWithEmail, BASE, addLinkMaterial, markSession, croatianDateRegex, expectNotFoundPage } from '../helpers/phase3'
import { clickUntilVisible, submitUntilUrl } from '../helpers/hydration'
import { fillInquiryStep1 } from '../helpers/upisi'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR9 — E2E Šibenik journey (launch gate for the two-city separation)
//
// Slavica (the seeded SIBENIK admin, sole admin AND teacher of her city) sets
// up her tenant end-to-end through the real UI:
//   plan the school year mid-cycle → create the Trokut group (city-scoped
//   dropdowns) → assign herself → open the enrollment window → the public
//   /upisi form under "Šibenik" offers exactly that one group → parent submits
//   → Slavica accepts (creates the student account) → marks attendance via the
//   teacher panel → the student's portal shows the group's material → the
//   admin student profile shows the marked session.
//
// Self-seeding: relies only on the seed's Slavica + Trokut location + shared
// SLR courses. Everything else is created by the journey itself — that IS the
// scenario (Šibenik launches with an empty tenant, mid-cycle).
// Requires: dev server on localhost:3000, seeded dev DB.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLAVICA_EMAIL = 'slavica.jurcevic@udruga-inovatic.hr'
const SLAVICA_PASSWORD = 'admin123'

const RUN_ID = Date.now().toString().slice(-8)
const CY = computeSchoolYear() // the journey runs in the CURRENT year — the portal only shows current-year enrollments

const GROUP_NAME = `Trokut Junior ${RUN_ID}`
const MATERIAL_TITLE = `Šibenik upute ${RUN_ID}`
// Monday, mid-cycle: 28 weekly sessions from here span past today (2026-07-10),
// so a module is still enrolling and the group stays publicly visible.
const PLAN_START_DISPLAY = '02.03.2026'
const SESSION_DATE = '2026-07-06' // a Monday inside the arc

const PARENT = {
  parentName: `Roditelj Šibenik ${RUN_ID}`,
  parentEmail: `sib-journey-${RUN_ID}@test.local`,
  parentPhone: '+385921112233',
  childFirstName: 'Šime',
  childLastName: `Putnik${RUN_ID}`,
}

/**
 * Reset the ENTIRE Šibenik tenant to its seeded state (Slavica + Trokut
 * location only). Safe by construction: every delete is city-bound, so Split
 * data is untouchable — which is itself the property this journey guards.
 */
async function wipeSibenikTenant() {
  await db.attendance.deleteMany({ where: { enrollment: { scheduledGroup: { city: 'SIBENIK' } } } })
  await db.moduleEnrollment.deleteMany({ where: { enrollment: { scheduledGroup: { city: 'SIBENIK' } } } })
  await db.studentComment.deleteMany({ where: { group: { city: 'SIBENIK' } } })
  await db.studentAssessment.deleteMany({ where: { group: { city: 'SIBENIK' } } })
  await db.enrollment.deleteMany({ where: { scheduledGroup: { city: 'SIBENIK' } } })
  await db.material.deleteMany({ where: { scheduledGroup: { city: 'SIBENIK' } } })
  await db.galleryImage.deleteMany({ where: { scheduledGroup: { city: 'SIBENIK' } } })
  await db.teacherAssignment.deleteMany({ where: { scheduledGroup: { city: 'SIBENIK' } } })
  await db.inquiry.deleteMany({ where: { city: 'SIBENIK' } })
  await db.scheduledGroup.deleteMany({ where: { city: 'SIBENIK' } })
  await db.courseEnrollmentWindow.deleteMany({ where: { city: 'SIBENIK' } })
  await db.moduleSchedule.deleteMany({ where: { city: 'SIBENIK' } })
  await db.schoolYearHoliday.deleteMany({ where: { city: 'SIBENIK' } })
  await db.user.deleteMany({ where: { city: 'SIBENIK', role: 'STUDENT' } })
}

async function loginAsSlavica(page: Page) {
  await page.context().clearCookies()
  await loginWithEmail(page, SLAVICA_EMAIL, SLAVICA_PASSWORD)
  await page.waitForURL(/\/admin/, { timeout: 30000 })
}

test.beforeAll(async () => {
  await wipeSibenikTenant()
})

test.afterAll(async () => {
  await wipeSibenikTenant()
})

test('Šibenik journey — plan → group → window → upisi → accept → attendance → portal', async ({ page }) => {
  test.setTimeout(420000)

  let groupId = ''
  let studentId = ''
  let credentials = { username: '', password: '' }

  await test.step('Slavica logs in city-bound, with an unplanned Šibenik year', async () => {
    await loginAsSlavica(page)
    // Static tenant chip in the desktop sidebar — her city is an account fact.
    // (The mobile header renders its own hidden copy, so scope to the aside.)
    await expect(page.locator('aside').getByText('Šibenik', { exact: true })).toBeVisible()

    // Split planned this year long ago; HER city's planner must still be open —
    // the planner state is per-city.
    await page.goto(`${BASE}/admin/skolska-godina`)
    await expect(page.getByRole('heading', { name: /Planiraj školsku godinu/ })).toBeVisible()
  })

  await test.step('plans the Šibenik school year mid-cycle', async () => {
    await page.locator('#planner-start-date').fill(PLAN_START_DISPLAY)
    await expect(page.getByText(/Pregled rasporeda modula/)).toBeVisible()
    await page.getByRole('button', { name: /Dovrši plan/ }).click()
    await expect(page.getByText(/Plan školske godine spremljen/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: /Planiraj školsku godinu/ })).toBeHidden()

    // 4 shared SLR courses × 4 modules, stamped with HER city.
    const sibRows = await db.moduleSchedule.count({ where: { schoolYear: CY, city: 'SIBENIK' } })
    expect(sibRows).toBe(16)
  })

  await test.step('creates the Trokut group — dropdowns offer only her city', async () => {
    await page.goto(`${BASE}/admin/grupe`)
    const dialog = page.locator('[role="dialog"]')
    await clickUntilVisible(page.locator('button', { hasText: 'Nova grupa' }), dialog)

    const courseSelect = dialog.locator('select').nth(0)
    const slrOpt = courseSelect.locator('option', { hasText: 'Robotike 1' }).first()
    await courseSelect.selectOption((await slrOpt.getAttribute('value'))!)

    // The venue dropdown is city-scoped: exactly one real option — Trokut.
    const locationSelect = dialog.locator('select').nth(1)
    await expect(locationSelect.locator('option')).toHaveCount(2)
    await expect(locationSelect.locator('option').nth(1)).toContainText('Trokut')
    await locationSelect.selectOption({ index: 1 })

    await dialog.locator('input[placeholder*="Grupa"]').fill(GROUP_NAME)
    await dialog.locator('select').nth(2).selectOption('Ponedjeljak')
    await dialog.locator('input[placeholder="19:00"]').fill('17:00')
    await dialog.locator('input[placeholder="20:30"]').fill('18:30')

    // The teacher multi-select is city-scoped: Šibenik's one assignable staff
    // member is Slavica herself (the city ADMIN). Any Split teacher here would
    // be a cross-city dropdown leak. Assign her at create time.
    const teacherBoxes = dialog.locator('input[type="checkbox"][id^="create-group-teacher-"]')
    await expect(teacherBoxes).toHaveCount(1)
    await expect(
      dialog.locator('label:has(input[id^="create-group-teacher-"])').first(),
    ).toContainText('Slavica')
    await teacherBoxes.first().check()

    await dialog.locator('button', { hasText: 'Kreiraj grupu' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Grupa kreirana.')).toBeVisible()

    const row = page.locator('tr', { hasText: GROUP_NAME }).first()
    await submitUntilUrl(page, row.locator('a', { hasText: GROUP_NAME }).first(), /\/admin\/grupe\/[a-z0-9]+$/)
    groupId = /\/admin\/grupe\/([a-z0-9]+)$/.exec(page.url())![1]

    // The assignment stuck: Slavica is listed as the group's teacher.
    await expect(page.getByText('Nema dodijeljenih nastavnika.')).toBeHidden()
    await expect(page.getByText('Slavica Jurčević').first()).toBeVisible()
  })

  await test.step('opens the Šibenik enrollment window for the shared SLR 1 program', async () => {
    await submitUntilUrl(
      page,
      page.getByRole('link', { name: 'Uredi u programu' }).first(),
      /\/admin\/programi\//,
    )
    // Let pending RSC refreshes settle: a server action fired while a retried
    // navigation's transition is still in flight can queue forever (dev-mode).
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Uredi', exact: true }).first().click()
    const start = page.locator('#window-start')
    await start.fill('01.01.2026')
    await start.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
    const end = page.locator('#window-end')
    await end.fill('31.12.2026')
    await end.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
    await page.getByRole('button', { name: 'Spremi' }).click()
    await expect(page.getByText('Prozor upisa spremljen.')).toBeVisible({ timeout: 10000 })
  })

  await test.step('reaches the teacher panel via the sidebar shortcut and adds a group material', async () => {
    await page.goto(`${BASE}/admin`)
    // The "Nastavnički panel" shortcut appears only for a city admin who also
    // teaches — Slavica has an assignment now (PR6's deferred browser check).
    await submitUntilUrl(
      page,
      page.getByRole('link', { name: 'Nastavnički panel' }).first(),
      /\/nastavnik/,
    )
    await expect(page.getByText(GROUP_NAME).first()).toBeVisible({ timeout: 15000 })

    // The reverse switcher: an admin inside the teacher panel gets a header
    // link back to /admin (plain teachers never see it).
    await expect(page.getByRole('link', { name: 'Administracija' })).toBeVisible()

    await page.goto(`${BASE}/nastavnik/grupa/${groupId}/materijali`)
    await addLinkMaterial(page, /Dodaj samo u ovu grupu/, MATERIAL_TITLE, 'https://example.com/sibenik-upute')
  })

  await test.step('post-login panel choice — dual-role admin picks the teacher panel', async () => {
    // Now that Slavica teaches a group, logging in must offer the panel choice
    // instead of auto-redirecting to /admin.
    await page.context().clearCookies()
    await page.goto(`${BASE}/prijava`)
    await page.locator('#identifier').fill(SLAVICA_EMAIL)
    await page.locator('input[type="password"]').fill(SLAVICA_PASSWORD)
    const teacherChoice = page.getByRole('button', { name: 'Nastavnički panel' })
    await clickUntilVisible(page.locator('button[type="submit"]'), teacherChoice)
    await expect(page.getByRole('button', { name: 'Administracija' })).toBeVisible()
    await submitUntilUrl(page, teacherChoice, /\/nastavnik/)
    await expect(page.getByText(GROUP_NAME).first()).toBeVisible({ timeout: 15000 })

    // The header link completes the roundtrip back to the admin panel.
    await submitUntilUrl(page, page.getByRole('link', { name: 'Administracija' }), /\/admin/)
  })

  await test.step('public /upisi under Šibenik offers exactly the one Trokut group', async () => {
    await page.goto(`${BASE}/upisi`)
    await fillInquiryStep1(page, {
      parentName: PARENT.parentName,
      parentEmail: PARENT.parentEmail,
      parentPhone: PARENT.parentPhone,
      city: 'SIBENIK',
    })

    await page.locator('#childFirstName').fill(PARENT.childFirstName)
    await page.locator('#childLastName').fill(PARENT.childLastName)
    const dobWrapper = page.locator('label', { hasText: 'Datum rođenja' }).locator('..')
    await dobWrapper.locator('select').nth(0).selectOption('15')
    await dobWrapper.locator('select').nth(1).selectOption('06')
    await dobWrapper.locator('select').nth(2).selectOption('2018')
    await clickUntilVisible(
      page.locator('button', { hasText: 'Dalje' }),
      page.locator('input[name="consent"]'),
    )

    await page.locator('#grade').selectOption('1')
    const groupSelect = page.locator('#scheduledGroupId')
    await expect(groupSelect).toBeEnabled({ timeout: 5000 })

    // THE isolation assertion of the public flow: Split runs open SLR-1 groups
    // under open windows all year — under "Šibenik" none of them may appear.
    const realOptions = groupSelect.locator('option:not([value=""])')
    await expect(realOptions).toHaveCount(1)
    await expect(realOptions.first()).toContainText(GROUP_NAME)

    await groupSelect.selectOption({ index: 1 })
    await page.locator('input[name="consent"]').check()
    await page.locator('button', { hasText: 'Pošalji upit' }).click()
    await expect(page.locator('text=Upit je poslan!')).toBeVisible({ timeout: 15000 })

    const inquiry = await db.inquiry.findFirst({ where: { parentEmail: PARENT.parentEmail } })
    expect(inquiry?.city).toBe('SIBENIK')
    expect(inquiry?.schoolYear).toBe(CY)
  })

  await test.step('Slavica accepts the inquiry — the group picker is city-scoped too', async () => {
    await loginAsSlavica(page)
    await page.goto(`${BASE}/admin/upiti?search=${encodeURIComponent(PARENT.parentEmail)}`)
    await expect(page.locator('a', { hasText: 'Detalji' })).toHaveCount(1, { timeout: 10000 })
    await page.locator('a', { hasText: 'Detalji' }).click()
    await page.waitForURL(/\/admin\/upiti\/[a-z0-9]+/)

    await page.getByRole('button', { name: 'Kreiraj račun i upiši' }).click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    const courseSelect = dialog.locator('select').first()
    const slrOpt = courseSelect.locator('option', { hasText: 'Robotike 1' }).first()
    await courseSelect.selectOption((await slrOpt.getAttribute('value'))!)

    // Exactly one radio: her city's one group for this course.
    await expect(dialog.locator('input[type="radio"]')).toHaveCount(1, { timeout: 10000 })
    await dialog.locator('input[type="radio"]').first().check()

    const allModules = dialog.locator('label', { hasText: 'Svi moduli' }).locator('input[type="checkbox"]')
    if (await allModules.isVisible().catch(() => false)) {
      await allModules.check()
    }

    await dialog.getByRole('button', { name: /Kreiraj račun/ }).click()
    const profileLink = page.getByRole('link', { name: /Pogledaj profil učenika/ })
    await expect(profileLink).toBeVisible({ timeout: 15000 })
    await submitUntilUrl(page, profileLink, /\/admin\/ucenici\/[a-z0-9]+/)
    studentId = /\/admin\/ucenici\/([a-z0-9]+)/.exec(page.url())![1]

    await expect(page.getByRole('heading', { name: 'Pristupni podaci' })).toBeVisible()
    const username = (
      await page.locator('xpath=//dt[normalize-space()="Korisničko ime"]/following-sibling::dd').first().innerText()
    ).trim()
    const password = (
      await page.locator('xpath=//dt[normalize-space()="Lozinka"]/following-sibling::dd').first().innerText()
    ).trim()
    credentials = { username, password }
    expect(credentials.username).not.toBe('')
    expect(credentials.password).not.toBe('')

    const student = await db.user.findUnique({ where: { id: studentId }, select: { city: true } })
    expect(student?.city).toBe('SIBENIK')
  })

  await test.step('marks a session in her teacher panel', async () => {
    await markSession(page, groupId, SESSION_DATE)
  })

  await test.step('the student logs in and lands on the Trokut group with its material', async () => {
    await page.context().clearCookies()
    await loginWithEmail(page, credentials.username, credentials.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    // Single enrollment → direct landing on the group's materials.
    await expect(page.getByText(/Robotike 1/).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(MATERIAL_TITLE).first()).toBeVisible()

    // A Split group is a 404 for a Šibenik student — indistinguishable from
    // a nonexistent id.
    const splitGroup = await db.scheduledGroup.findFirst({
      where: { city: 'SPLIT' },
      select: { id: true },
    })
    if (splitGroup) {
      await page.goto(`${BASE}/portal/grupa/${splitGroup.id}`)
      await expectNotFoundPage(page)
    }
  })

  await test.step('the admin student profile shows the marked session', async () => {
    await loginAsSlavica(page)
    await page.goto(`${BASE}/admin/ucenici/${studentId}`)
    await expect(page.getByRole('heading', { name: 'Pristupni podaci' })).toBeVisible()
    await expect(page.getByText(croatianDateRegex(SESSION_DATE)).first()).toBeVisible()
  })
})
