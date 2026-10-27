// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 test helpers — UI-driven seeders.
//
// IMPORTANT: `createTeacher`, `createStudentInGroup`, `createStudentNoEnrollment`,
// and `assignTeacherToGroup` exercise the admin "Kreiraj učenika" / "Kreiraj
// nastavnika" dialogs end-to-end (clicks, form fills, password capture).
// Per Flux lu3f9sh, these UI helpers should ONLY be used by:
//   - tests/phase2/17-students.spec.ts
//   - tests/phase2/19-teachers.spec.ts
// as deliberate dialog-regression guards. Every other Phase 3 spec switches
// to direct-Prisma seeding via `tests/helpers/seed.ts` (~25-50s saved per
// fixture).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { expect, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { v2 as cloudinarySdk } from 'cloudinary'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { getGroupModuleArc } from '@/lib/group-module-arc'
import { zagrebDateKey } from '@/lib/attendance-window'
import { grantLogin, grantParentLogin, uniqueParentEmail } from './seed'

export const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jpucic00@gmail.com'
const ADMIN_PASSWORD = 'admin123'

const STATE_FILE = path.resolve(__dirname, '../fixtures/phase3-state.json')

function readBootstrappedGroupIds(): string[] {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      'phase3-state.json not found — run 20-bootstrap.spec.ts first',
    )
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  return state.groupIds
}

export type TeacherData = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export type StudentData = {
  firstName: string
  lastName: string
  dateOfBirth: string
  childSchool: string
  parentName: string
  parentEmail: string
  parentPhone: string
}

/**
 * Delegates to `loginWithEmail` rather than driving the form itself: the seeded
 * admin can acquire a TeacherAssignment (any spec that assigns them to a group),
 * which flips login to the dual-role panel chooser. This helper used to wait for
 * /admin forever in that case — a login that had actually *succeeded* looked
 * like a hung page, and took down whichever beforeAll called it.
 */
export async function loginAsAdmin(page: Page) {
  await loginWithEmail(page, ADMIN_EMAIL, ADMIN_PASSWORD)
}

/**
 * Get a signed-out /portal login form, even when the page still belongs to the
 * previous user of a mid-test account switch.
 *
 * Clearing cookies alone is not enough. The Auth.js middleware re-signs the
 * session cookie on EVERY matched response (rolling JWT expiry), so any request
 * the old page still has in flight hands the old session back the moment its
 * response lands — after the wipe. The gallery's `?tab=` `router.replace`, which
 * fires after hydration and so after a spec's assertions on the SSR'd grid, is
 * one such request. If it lands before the /portal request goes out, /portal
 * sees the previous student and forwards them to /portal/grupa/<id>, and the
 * form never renders.
 *
 * Leaving for about:blank first unloads that document, which cancels its
 * pending requests before they can set anything, so the wipe that follows
 * sticks. Checking the landing and retrying once stays as a backstop.
 */
export async function openLoginForm(page: Page): Promise<void> {
  const identifier = page.locator('#identifier')
  let landed = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('about:blank')
    await page.context().clearCookies()
    await page.goto(`${BASE}/portal`)
    landed = page.url()
    if (new URL(landed).pathname !== '/portal') continue
    const shown = await identifier
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    if (shown) return
    landed = page.url()
  }
  throw new Error(
    `login form did not render at /portal after clearing cookies twice; page is at ${landed}` +
      ' (a session cookie was probably re-set by a late response)',
  )
}

export async function loginWithEmail(page: Page, email: string, password: string) {
  // Specs re-login mid-test to switch accounts. /portal bounces an existing
  // session straight to its panel or group before the form can render, so the
  // current session has to go first — see openLoginForm.
  await openLoginForm(page)
  await page.locator('#identifier').fill(email)
  await page.locator('input[type="password"]').fill(password)
  // A dual-role admin (ADMIN with ≥1 TeacherAssignment) lands on the
  // /portal/odabir picker instead of a panel; pick "Administracija" so specs
  // land on /admin exactly as they did before the choice existed. Mirrors the
  // retry shape of submitUntilUrl (hydration can swallow early clicks).
  //
  // /portal is BOTH the login screen and the family destination, so a URL
  // check alone cannot tell "still logged out" from "logged in as a parent":
  // staff navigate away to /admin | /nastavnik, while a parent stays under
  // /portal and the login form is replaced by the portal shell or the child
  // picker. The form's #identifier field disappearing is the parent signal.
  const staffUrl = /\/(admin|nastavnik)/
  const adminChoice = page.getByRole('link', { name: 'Administracija' })
  const submit = page.locator('button[type="submit"]')
  const identifier = page.locator('#identifier')
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (staffUrl.test(page.url())) break
    if (await adminChoice.isVisible().catch(() => false)) {
      await adminChoice.click({ timeout: 5000 }).catch(() => undefined)
      await page.waitForURL(/\/admin/, { timeout: 20000 }).catch(() => undefined)
      continue
    }
    if ((await identifier.count()) === 0) break // student: portal shell replaced the form
    // Re-fill on every attempt. A click that lands before hydration is
    // swallowed, and React then resets the controlled inputs to empty — so a
    // loop that filled only once would submit a blank form on every retry and
    // could never recover, timing out 45s later on a login that was fine.
    await identifier.fill(email).catch(() => undefined)
    await page.locator('input[type="password"]').fill(password).catch(() => undefined)
    await submit.click({ timeout: 5000 }).catch(() => undefined)
    await Promise.race([
      page.waitForURL(staffUrl, { timeout: 20000 }).catch(() => undefined),
      adminChoice.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined),
      identifier.waitFor({ state: 'detached', timeout: 20000 }).catch(() => undefined),
    ])
  }
  if (!staffUrl.test(page.url()) && (await identifier.count()) > 0) {
    throw new Error(`login as ${email} did not complete within 45s`)
  }
  await page.waitForLoadState('domcontentloaded')
}

// Both `collectGroupIds` and `pickStandardGroupId` just read from
// tests/fixtures/phase3-state.json — they don't actually need a Page. The
// optional `_page` parameter is kept so existing call sites still type-check
// without churn; seed.ts-only specs can omit it entirely.
export function collectGroupIds(countOrPage: number | Page, maybeCount?: number): string[] {
  const count = typeof countOrPage === 'number' ? countOrPage : maybeCount!
  const ids = readBootstrappedGroupIds()
  if (ids.length < count) {
    throw new Error(`Need at least ${count} groups; found ${ids.length}`)
  }
  return ids.slice(0, count)
}

export function pickStandardGroupId(_page?: Page): string {
  const ids = readBootstrappedGroupIds()
  if (ids.length === 0) throw new Error('no groups in phase3-state.json')
  return ids[0]
}

export async function getGroupCourseTitle(page: Page, groupId: string): Promise<string> {
  await page.goto(`${BASE}/admin/grupe/${groupId}`)
  const heading = (await page.locator('h1').first().innerText()).trim()
  return heading.split('–')[0].trim()
}

export async function createTeacher(
  page: Page,
  t: TeacherData,
): Promise<{ password: string; teacherId: string }> {
  await page.goto(`${BASE}/admin/nastavnici`)
  await page.getByRole('button', { name: 'Kreiraj nastavnika' }).click()
  await page.locator('#teacher-email').fill(t.email)
  await page.locator('#teacher-first').fill(t.firstName)
  await page.locator('#teacher-last').fill(t.lastName)
  await page.locator('#teacher-phone').fill(t.phone)
  await page.getByRole('button', { name: /^Kreiraj nastavnika$/ }).click()
  await expect(page.getByText('Nastavnik kreiran', { exact: true })).toBeVisible({ timeout: 15000 })

  const dialog = page.locator('[role="dialog"]')

  const profileLink = dialog.getByRole('link', { name: /Profil nastavnika|Otvori profil/i }).first()
  const href = (await profileLink.getAttribute('href')) ?? ''
  const m = href.match(/\/admin\/nastavnici\/([^/?#]+)/)
  if (!m) throw new Error(`Could not extract teacher ID from ${href}`)
  const teacherId = m[1]

  await page.getByRole('button', { name: 'Zatvori' }).click()
  // No password is shown or mailed any more — the teacher would set one through
  // the link. Give the fixture a known one straight in the database.
  return { password: await grantLogin(teacherId), teacherId }
}

export async function assignTeacherToGroup(page: Page, teacherId: string, groupId: string) {
  await page.goto(`${BASE}/admin/nastavnici/${teacherId}`)
  await page.getByRole('button', { name: /Dodijeli grupu/ }).click()
  const select = page.locator('#assign-group-select')
  await expect(select).toBeVisible()
  await select.selectOption(groupId)
  await page.getByRole('button', { name: /^Dodijeli$/ }).click()
  await expect(page.locator('button[aria-label="Ukloni dodjelu"]').first()).toBeVisible({
    timeout: 10000,
  })
}

/**
 * #create-student-dob is a DateInput: its text field expects dd.MM.yyyy and
 * commits on blur — an ISO string silently fails to parse, the RHF value stays
 * empty, and the dialog's submit never enables. Accept both shapes, fill the
 * display format, then dispatch blur to commit.
 */
async function fillDob(page: Page, dob: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  const display = m ? `${m[3]}.${m[2]}.${m[1]}` : dob
  const input = page.locator('#create-student-dob')
  await input.fill(display)
  await input.evaluate((el) => el.dispatchEvent(new Event('blur', { bubbles: true })))
}

/**
 * Submit the "Kreiraj učenika" dialog, confirming the parent-account link when
 * the server asks. Fixture children keep the same name + birth date across
 * runs, so a child left over from an earlier run is recognised and — arriving
 * with this run's unique parent address — needs the admin's yes to move.
 */
async function submitCreateStudent(dialog: ReturnType<Page['locator']>): Promise<void> {
  await dialog.getByRole('button', { name: 'Kreiraj učenika' }).click()
  const confirm = dialog.getByRole('button', { name: 'Potvrdi i kreiraj' })
  await Promise.race([
    dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined),
    confirm.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined),
  ])
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

export async function createStudentInGroup(
  page: Page,
  groupId: string,
  student: StudentData,
): Promise<{ studentId: string; loginEmail: string; password: string }> {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()
  await page.locator('#create-student-first').fill(student.firstName)
  await page.locator('#create-student-last').fill(student.lastName)
  await fillDob(page, student.dateOfBirth)
  await page.locator('#create-student-school').fill(student.childSchool)
  await page.locator('#create-student-parent-name').fill(student.parentName)
  // Unique per call — see uniqueParentEmail: a shared fixture address would be
  // one parent login seeing every such child.
  await page.locator('#create-student-parent-email').fill(uniqueParentEmail(student.parentEmail))
  await page.locator('#create-student-parent-phone').fill(student.parentPhone)

  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  const courseSelect = dialog.locator('select').first()
  await courseSelect.waitFor({ state: 'visible', timeout: 5000 })
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    const radio = dialog.locator(`input[type="radio"][value="${groupId}"]`)
    await radio
      .first()
      .waitFor({ state: 'attached', timeout: 3000 })
      .catch(() => null)
    if ((await radio.count()) > 0) {
      // A full group renders a disabled radio; checking it retries for minutes
      // and then reports as whatever test happened to own this beforeAll. Fail
      // fast with the real reason instead.
      if (await radio.first().isDisabled()) {
        throw new Error(
          `group ${groupId} is at capacity — its radio is disabled. Clear the fixture group's ` +
            `enrolments (see .claude/validate.md) or re-run 20-bootstrap.spec.ts.`,
        )
      }
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in any course dropdown`)

  const allModulesLabel = dialog.locator('label', { hasText: 'Svi moduli' })
  if (await allModulesLabel.isVisible().catch(() => false)) {
    const cb = allModulesLabel.locator('input[type="checkbox"]')
    if (!(await cb.isChecked())) await allModulesLabel.click()
  }

  await submitCreateStudent(dialog)

  await page.goto(`${BASE}/admin/ucenici?search=${encodeURIComponent(student.lastName)}`)
  const row = page.locator('a[href^="/admin/ucenici/"]', { hasText: student.lastName }).first()
  const href = (await row.getAttribute('href')) ?? ''
  const studentId = href.match(/\/admin\/ucenici\/([^/?#]+)/)?.[1] ?? ''
  if (!studentId) throw new Error('student id not found after creation')
  await row.click()
  await page.waitForURL(/\/admin\/ucenici\/[a-z0-9]+/)

  return { studentId, ...(await grantParentLogin(studentId)) }
}

export async function createStudentNoEnrollment(
  page: Page,
  student: StudentData,
): Promise<{ studentId: string; loginEmail: string; password: string }> {
  await page.goto(`${BASE}/admin/ucenici`)
  await page.getByRole('button', { name: 'Kreiraj učenika' }).click()

  await page.locator('#create-student-first').fill(student.firstName)
  await page.locator('#create-student-last').fill(student.lastName)
  await fillDob(page, student.dateOfBirth)
  await page.locator('#create-student-school').fill(student.childSchool)
  await page.locator('#create-student-parent-name').fill(student.parentName)
  // Unique per call — see uniqueParentEmail: a shared fixture address would be
  // one parent login seeing every such child.
  await page.locator('#create-student-parent-email').fill(uniqueParentEmail(student.parentEmail))
  await page.locator('#create-student-parent-phone').fill(student.parentPhone)

  const dialog = page.locator('[role="dialog"]')
  await submitCreateStudent(dialog)

  // Deliberately NOT via /admin/ucenici: that list is year-scoped to
  // `getSelectedSchoolYear()`, and a child with no enrollment in that year is
  // absent from it by design — which is exactly the fixture this helper makes,
  // so its row could never appear and the click timed out. Resolve the id with
  // Prisma the way `tests/helpers/seed.ts` does and open the detail page, which
  // is where the credentials live anyway.
  const created = await db.user.findFirst({
    where: { role: 'STUDENT', lastName: student.lastName },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!created) {
    throw new Error(`student ${student.lastName} not found after creation`)
  }
  return { studentId: created.id, ...(await grantParentLogin(created.id)) }
}

// ─── Materijali v2: lessons ─────────────────────────────────────────────────
//
// Every material a child can see sits in a LESSON of the program (program →
// module → lesson → material), with an audience: STUDENT (portal) or TEACHER
// (staff only). The helpers below either drive the real lesson editor and the
// group's lesson view, or seed a lesson straight into the database for specs
// that only need one to exist.
//
// Determinism: a lesson binds to SAT NUMBERS, and which lesson is "current"
// (open by default) depends on the group's weekday arc and today's date — and
// `(moduleId, sessionNumber)` is unique across the shared curriculum, so a
// fixture taking sat 1 could collide with dev data or another run. Fixture
// lessons therefore take NO sat by default, live on the group's ACTIVE module
// (the one the portal shows), and every assertion opens the lesson first with
// `openLesson` instead of relying on what starts expanded.

type FixtureLink = { title: string; url: string; type?: 'LINK' | 'VIDEO' | 'ROBOCAMP' }

export type LessonTarget = {
  courseId: string
  /** null for a radionica — its lessons hang directly off the program. */
  moduleId: string | null
  moduleTitle: string | null
}

/**
 * Where a lesson must live for this group's portal to show it: the module the
 * group is working through today (standard), the first natjecanje (all are
 * shown at once), or the program itself (radionica). Mirrors `buildGroupShell`,
 * whose active-module pick is per group and per calendar day.
 */
export async function groupLessonTarget(groupId: string): Promise<LessonTarget> {
  const schoolYear = computeSchoolYear()
  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      city: true,
      dayOfWeek: true,
      course: {
        select: {
          id: true,
          kind: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: { schedules: { where: { schoolYear } } },
          },
        },
      },
    },
  })
  const { course } = group
  if (course.kind === 'RADIONICA' || course.modules.length === 0) {
    return { courseId: course.id, moduleId: null, moduleTitle: null }
  }
  const active =
    getCurrentActiveModuleForGroup({
      dayOfWeek: group.dayOfWeek,
      modules: course.modules,
      schoolYear,
      city: group.city,
      kind: course.kind,
      holidayDates: await loadHolidayDateKeys(schoolYear, group.city),
    }) ?? course.modules[0]
  return { courseId: course.id, moduleId: active.id, moduleTitle: active.title }
}

/**
 * Put a spec's lesson on the group's latest sat reached today, so a parent sees
 * it: a parent gets only the current lesson, and in a dated module a lesson
 * with no sat is never current. Any lesson already holding that sat (dev data,
 * typically) is moved aside for the run — call the returned function in
 * `afterAll` to put it back. Standard modules only.
 */
export async function pinLessonToCurrentSat(groupId: string, lessonId: string): Promise<() => Promise<void>> {
  const schoolYear = computeSchoolYear()
  const [group, lesson] = await Promise.all([
    db.scheduledGroup.findUniqueOrThrow({
      where: { id: groupId },
      select: {
        city: true,
        dayOfWeek: true,
        course: { select: { modules: { include: { schedules: { where: { schoolYear } } } } } },
      },
    }),
    db.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { moduleId: true } }),
  ])
  const moduleId = lesson.moduleId
  if (!moduleId) throw new Error('pinLessonToCurrentSat: the lesson has no module')

  const arc = getGroupModuleArc({
    dayOfWeek: group.dayOfWeek,
    modules: group.course.modules.map((m) => {
      const schedule = m.schedules.find((s) => s.city === group.city) ?? null
      return {
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        schedule: schedule ? { id: schedule.id, startDate: schedule.startDate, endDate: schedule.endDate } : null,
      }
    }),
    holidayDates: await loadHolidayDateKeys(schoolYear, group.city),
  })
  const today = zagrebDateKey(new Date())
  const reached = (arc.find((e) => e.moduleId === moduleId)?.sessionDates ?? []).filter(
    (d) => d.toISOString().slice(0, 10) <= today,
  ).length
  if (reached === 0) {
    throw new Error(
      'pinLessonToCurrentSat: the group has not reached a sat of this module yet — run `npm run db:refresh-dev-dates -- --apply`',
    )
  }

  const displaced = await db.lessonSession.findUnique({
    where: { moduleId_sessionNumber: { moduleId, sessionNumber: reached } },
  })
  if (displaced) await db.lessonSession.delete({ where: { id: displaced.id } })
  await db.lessonSession.deleteMany({ where: { lessonId } })
  await db.lessonSession.create({ data: { lessonId, moduleId, sessionNumber: reached } })

  return async () => {
    await db.lessonSession.deleteMany({ where: { lessonId } })
    if (displaced) {
      await db.lessonSession.create({
        data: { lessonId: displaced.lessonId, moduleId, sessionNumber: displaced.sessionNumber },
      })
    }
  }
}

async function adminUserId(): Promise<string> {
  const admin = await db.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true } })
  return admin.id
}

/**
 * Fast path: a curriculum lesson with LINK-type materials, straight into the
 * database. For specs that need a lesson to exist (a teacher adds a group
 * material into it, a portal reads it) but are not about the lesson editor.
 * Put the run id in `title` — `cleanupRunFixtures` sweeps lessons by title.
 */
export async function seedLesson(input: {
  target: LessonTarget
  title: string
  sessionNumbers?: number[]
  studentLinks?: FixtureLink[]
  teacherLinks?: FixtureLink[]
}): Promise<{ lessonId: string; materialIds: Record<string, string> }> {
  const uploadedById = await adminUserId()
  const { courseId, moduleId } = input.target
  const lesson = await db.lesson.create({
    data: { courseId, moduleId, title: input.title },
    select: { id: true },
  })
  if (input.sessionNumbers?.length) {
    if (!moduleId) throw new Error('seedLesson: only a module lesson can hold sats')
    await db.lessonSession.createMany({
      data: input.sessionNumbers.map((sessionNumber) => ({
        lessonId: lesson.id,
        moduleId,
        sessionNumber,
      })),
    })
  }
  const materialIds: Record<string, string> = {}
  const rows = [
    ...(input.studentLinks ?? []).map((l) => ({ ...l, audience: 'STUDENT' as const })),
    ...(input.teacherLinks ?? []).map((l) => ({ ...l, audience: 'TEACHER' as const })),
  ]
  for (const row of rows) {
    const m = await db.material.create({
      data: {
        scope: 'LESSON',
        audience: row.audience,
        lessonId: lesson.id,
        title: row.title,
        type: row.type ?? 'LINK',
        externalUrl: row.url,
        uploadedById,
      },
      select: { id: true },
    })
    materialIds[row.title] = m.id
  }
  return { lessonId: lesson.id, materialIds }
}

/**
 * Re-fill a controlled input until React holds the value. A fill that lands
 * before hydration is wiped when the input re-renders — see loginWithEmail.
 */
async function fillControlled(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector)
  await expect(async () => {
    await input.fill(value)
    await page.waitForTimeout(150)
    await expect(input).toHaveValue(value, { timeout: 500 })
  }).toPass({ timeout: 20000 })
}

/** Open a URL dialog (Poveznica / Video poveznica / RoboCamp) inside `scope` and add one link. */
async function addLinkInSection(
  page: Page,
  scope: Locator,
  link: FixtureLink,
): Promise<void> {
  const kind = link.type ?? 'LINK'
  const trigger = { LINK: 'Poveznica', VIDEO: 'Video poveznica', ROBOCAMP: 'RoboCamp' }[kind]
  const dialog = page.getByRole('dialog')
  // The trigger is a Radix DialogTrigger: a click before hydration does nothing.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await scope.getByRole('button', { name: trigger, exact: true }).click({ timeout: 2000 })
    }
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
  await dialog.locator(`#link-material-title-${kind}`).fill(link.title)
  await dialog.locator(`#link-material-url-${kind}`).fill(link.url)
  await dialog.getByRole('button', { name: 'Dodaj', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

/**
 * Creates a lesson through the real admin editor: program page → the module's
 * "Nova lekcija" → title, optional sats, URL materials into the two sections →
 * "Spremi lekciju". Returns the new lesson's id (from the editor URL it lands on).
 */
export async function createLessonOnProgramPage(
  page: Page,
  input: {
    target: LessonTarget
    title: string
    sats?: number[]
    studentLinks?: FixtureLink[]
    teacherLinks?: FixtureLink[]
  },
): Promise<string> {
  const { courseId, moduleId } = input.target
  await page.goto(`${BASE}/admin/programi/${courseId}`)
  // The module card's own "Nova lekcija" (no `sat=`): free-sat rows link to the
  // same route with `&sat=N`, so the exact href picks this module's button.
  const href = `/admin/programi/${courseId}/lekcija/nova${moduleId ? `?modul=${moduleId}` : ''}`
  await page.locator(`a[href="${href}"]`).first().click()
  await page.waitForURL(/\/lekcija\/nova/, { timeout: 30000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Nova lekcija' })).toBeVisible()

  await fillControlled(page, '#lesson-title', input.title)

  for (const sat of input.sats ?? []) {
    const label = sat === 0 ? /^Probni sat/ : new RegExp(`^${sat}\\. sat`)
    const chip = page.getByRole('button', { name: label })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }

  const section = (heading: string) =>
    page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
  for (const link of input.teacherLinks ?? []) {
    await addLinkInSection(page, section('Materijali za nastavnike'), link)
  }
  for (const link of input.studentLinks ?? []) {
    await addLinkInSection(page, section('Materijali za polaznike'), link)
  }

  await page.getByRole('button', { name: 'Spremi lekciju' }).click()
  await page.waitForURL(/\/lekcija\/(?!nova)[a-z0-9]+$/, { timeout: 30000 })
  const lessonId = /\/lekcija\/([a-z0-9]+)$/.exec(page.url())![1]
  await expect(page.getByRole('heading', { level: 1, name: input.title })).toBeVisible()
  return lessonId
}

/**
 * Open one lesson of a lesson accordion — the portal's (or a parent's single
 * current-lesson card), or the staff group
 * view's (`/nastavnik/grupa/<id>/materijali`, `/admin/grupe/<id>`). The staff
 * view also folds whole modules, so any folded module is opened first. Returns
 * the lesson's `<li>` for scoping assertions.
 *
 * On the staff view the CURRENT lesson is always open and its heading is not a
 * button at all, so a heading without a toggle is already open. Otherwise the
 * click is retried (a tap before hydration is swallowed), and checking
 * `aria-expanded` first means a lesson the page already opened is never
 * toggled shut.
 */
export async function openLesson(page: Page, lessonTitle: string): Promise<Locator> {
  const folded = page.locator('button[aria-controls^="modul-"][aria-expanded="false"]')
  await expect(async () => {
    const n = await folded.count()
    for (let i = 0; i < n; i++) await folded.first().click({ timeout: 2000 })
    await expect(folded).toHaveCount(0, { timeout: 1000 })
  }).toPass({ timeout: 20000 })

  const heading = page.getByRole('heading', { level: 3, name: lessonTitle })
  await expect(heading).toBeVisible({ timeout: 15000 })
  const toggle = heading.getByRole('button')
  if ((await toggle.count()) > 0) {
    await expect(async () => {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click({ timeout: 2000 })
      await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 })
    }).toPass({ timeout: 20000 })
  }
  // A parent's single current-lesson card is an <article>, accordion lessons
  // are <li>s; the innermost match is the lesson itself.
  return page.locator('li, article').filter({ has: heading }).last()
}

/** One audience section ("Za nastavnike" / "Za polaznike") of an open staff lesson. */
export function lessonAudienceSection(
  page: Page,
  lesson: Locator,
  audience: 'STUDENT' | 'TEACHER',
): Locator {
  return lesson.locator('section').filter({
    has: page.getByRole('heading', {
      level: 4,
      name: audience === 'STUDENT' ? 'Za polaznike' : 'Za nastavnike',
      exact: true,
    }),
  })
}

/**
 * One material card in a card grid (portal or the staff tree). On the staff
 * tree a deletable card is wrapped together with its "Obriši materijal"
 * button, so the returned locator scopes that button too.
 */
export function materialCard(scope: Locator, title: string): Locator {
  return scope.locator('.grid > *').filter({ hasText: title })
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Opens a group tab's "Dodaj materijal" modal with the lesson and the audience
 * picked (the audience has no default). Returns the dialog; the kind defaults
 * to Datoteka.
 */
export async function openAddGroupMaterial(
  page: Page,
  lessonTitle: string,
  audience: 'STUDENT' | 'TEACHER',
): Promise<Locator> {
  const dialog = page.getByRole('dialog')
  // A Radix DialogTrigger: a click before hydration does nothing.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole('button', { name: 'Dodaj materijal' }).click({ timeout: 2000 })
    }
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
  // An option reads "<title>" or "<title> (<sats>)" — match the title whole, so
  // "Lekcija X" never picks "Radionica lekcija X".
  const value = await dialog
    .locator('#group-material-lesson option')
    .filter({ hasText: new RegExp(`^${escapeRegExp(lessonTitle)}( \\(.*\\))?$`) })
    .first()
    .getAttribute('value')
  await dialog.locator('#group-material-lesson').selectOption(value!)
  const audienceLabel = audience === 'STUDENT' ? 'Za polaznike' : 'Za nastavnike'
  await dialog.locator('label').filter({ hasText: audienceLabel }).click()
  await expect(dialog.getByRole('radio', { name: new RegExp(audienceLabel) })).toBeChecked()
  return dialog
}

/**
 * On a group's Materijali tab: adds a URL material that belongs to THIS group
 * only (scope GROUP) into an existing lesson, under "Za polaznike" or "Za
 * nastavnike", through the "Dodaj materijal" modal. Returns the new card on
 * the tab (wrapped with its delete button when the viewer may delete it).
 */
export async function addGroupLinkMaterial(
  page: Page,
  lessonTitle: string,
  audience: 'STUDENT' | 'TEACHER',
  link: FixtureLink,
): Promise<Locator> {
  const dialog = await openAddGroupMaterial(page, lessonTitle, audience)
  const kind = link.type ?? 'LINK'
  const kindLabel = { LINK: 'Poveznica', VIDEO: 'Video poveznica', ROBOCAMP: 'RoboCamp' }[kind]
  await dialog.locator('label').filter({ hasText: new RegExp(`^${kindLabel}$`) }).click()
  await dialog.locator('#group-material-url').fill(link.url)
  await dialog.locator('#group-material-title').fill(link.title)
  const save = dialog.getByRole('button', { name: 'Spremi', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog).toBeHidden({ timeout: 15000 })

  const lesson = await openLesson(page, lessonTitle)
  const card = materialCard(lessonAudienceSection(page, lesson, audience), link.title)
  await expect(card).toBeVisible({ timeout: 15000 })
  return card
}

/**
 * Adds a teacher-only whole-program (COURSE) LINK through the program page's
 * "Za nastavnike — cijeli program" section — the one material outside a lesson
 * that survives Materijali v2, and never reaches the portal.
 */
export async function addTeacherProgramMaterial(
  page: Page,
  courseId: string,
  title: string,
  url: string,
): Promise<void> {
  await page.goto(`${BASE}/admin/programi/${courseId}`)
  const section = page.locator('section').filter({
    has: page.getByRole('heading', { level: 2, name: 'Za nastavnike — cijeli program' }),
  })
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await section.getByRole('button', { name: 'Dodaj', exact: true }).click({ timeout: 2000 })
    }
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
  await dialog.locator('#material-title').fill(title)
  await dialog.locator('label', { hasText: 'Poveznica' }).click()
  await dialog.locator('#material-external-url').fill(url)
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
  await expect(section.getByText(title)).toBeVisible({ timeout: 15000 })
}

let cloudinaryConfigured = false
function configureCloudinaryOnce() {
  if (cloudinaryConfigured) return
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const key = process.env.CLOUDINARY_API_KEY
  const secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) {
    throw new Error('cloudinaryAssetStatus: CLOUDINARY_* env vars missing')
  }
  cloudinarySdk.config({ cloud_name: cloud, api_key: key, api_secret: secret })
  cloudinaryConfigured = true
}

/**
 * Hit Cloudinary's Admin API (NOT the CDN) to check whether an uploaded
 * asset still exists. Used as a deterministic alternative to polling the
 * CDN — the Admin API queries Cloudinary's metadata DB, so a destroy()
 * reflects ~1-3s after the fire-and-forget cleanup kicks off in
 * src/actions/material/crud.ts:160 with no CDN propagation delay.
 *
 * Returns the HTTP status: 200 if the asset exists, 404 if destroyed.
 * Throws if Cloudinary creds aren't configured — call sites should check
 * env presence and test.skip() rather than fail noisily.
 *
 * Uses the cloudinary SDK rather than a hand-rolled fetch so we don't have
 * to wrangle URL encoding for publicIds that contain folder slashes.
 */
export async function cloudinaryAssetStatus(
  publicId: string,
  resourceType: 'image' | 'raw' | 'video',
): Promise<number> {
  configureCloudinaryOnce()
  try {
    await cloudinarySdk.api.resource(publicId, { resource_type: resourceType })
    return 200
  } catch (err: unknown) {
    const httpCode =
      (err as { error?: { http_code?: number } }).error?.http_code ??
      (err as { http_code?: number }).http_code
    if (httpCode === 404) return 404
    throw err
  }
}

export async function markSession(page: Page, groupId: string, date: string) {
  await page.goto(`${BASE}/nastavnik/grupa/${groupId}/dolazak`)
  const dateInput = page.locator('input[type="date"]')
  await dateInput.waitFor({ state: 'visible', timeout: 20000 })
  const addBtn = page.getByRole('button', { name: 'Dodaj' })
  // Re-fill until React reflects it. A fill that lands before hydration is
  // swallowed when the controlled input re-renders empty — the same failure
  // mode loginWithEmail retries around — and Dodaj then stays disabled with
  // the date sitting visibly in the box.
  await expect(async () => {
    await dateInput.fill(date)
    await dateInput.evaluate((el) => el.dispatchEvent(new Event('input', { bubbles: true })))
    await expect(addBtn).toBeEnabled({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
  await addBtn.click()
  // Wait for React to commit setSelected(date) before clicking Spremi —
  // otherwise handleSave can read the previous `selected` and persist the
  // attendance against the wrong date. The right-column <h3> in
  // attendance-marker.tsx renders the active session in Croatian format.
  await expect(
    page.getByRole('heading', { level: 3, name: croatianDateRegex(date) }),
  ).toBeVisible({ timeout: 5000 })
  // Every box starts empty since the marker moved to checkboxes — an untouched
  // session claims nothing. The header checkbox is the teacher's own one-click
  // shortcut for a full class, and it is what makes this roster present.
  await page.getByRole('checkbox', { name: 'Označi sve prisutne' }).click()
  await page.getByRole('button', { name: 'Spremi evidenciju' }).click()
  await expect(page.getByText('Evidencija spremljena.')).toBeVisible({ timeout: 15000 })
}

/**
 * Today's Europe/Zagreb date as `YYYY-MM-DD`. Teachers may only record the
 * current month up to today, so any spec that marks a session through the
 * teacher UI must use this rather than a hardcoded date that ages out.
 */
export function markableToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
}

/** Match Croatian `dd.MM.yyyy.` / `dd. MM. yyyy.` rendering of an ISO date. */
export function croatianDateRegex(isoDate: string): RegExp {
  const [yyyy, mm, dd] = isoDate.split('-')
  return new RegExp(`${dd}\\.\\s?${mm}\\.\\s?${yyyy}\\.`)
}

export async function addEnrollmentToStudent(
  page: Page,
  studentId: string,
  groupId: string,
) {
  await page.goto(`${BASE}/admin/ucenici/${studentId}`)
  await page.getByRole('button', { name: 'Upiši u novu grupu' }).click()

  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  const courseSelect = dialog.locator('#add-enrollment-course')
  const optionCount = await courseSelect.locator('option').count()
  let found = false
  for (let i = 1; i < optionCount; i++) {
    await courseSelect.selectOption({ index: i })
    const radio = dialog.locator(`input[name="add-enrollment-group"][value="${groupId}"]`)
    await radio
      .first()
      .waitFor({ state: 'attached', timeout: 2000 })
      .catch(() => null)
    if ((await radio.count()) > 0) {
      await radio.check()
      found = true
      break
    }
  }
  if (!found) throw new Error(`group ${groupId} not found in add-enrollment dialog`)

  const allModulesLabel2 = dialog.locator('label', { hasText: 'Svi moduli' })
  if (await allModulesLabel2.isVisible().catch(() => false)) {
    const cb = allModulesLabel2.locator('input[type="checkbox"]')
    if (!(await cb.isChecked())) await allModulesLabel2.click()
  }

  await dialog.getByRole('button', { name: 'Upiši' }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

export async function expectNotFoundPage(page: Page) {
  await page.waitForLoadState('networkidle')
  const body = (await page.locator('body').innerText()).toLowerCase()
  const hasNotFound =
    body.includes('not found') ||
    body.includes('404') ||
    body.includes('stranica nije pronađena')
  expect(hasNotFound, `Expected a not-found page but got: "${body.slice(0, 200)}"`).toBe(true)
}

/**
 * Navigate to a portal path, for specs that walk a LIST of them in one page.
 *
 * Two things bite there, both timing rather than logic:
 *
 * 1. `/portal` renders group cards whose links the App Router prefetches the
 *    moment it hydrates. A `goto` fired while one of those RSC prefetches is
 *    still in flight is cancelled by Chromium as `net::ERR_ABORTED` — the
 *    request never reaches the server, which answers 200 for every one of these
 *    URLs when asked directly. Letting it settle and going once more is enough.
 * 2. `/portal` also sends a child with a single enrollment straight to their
 *    group (2026-08-24), so the page can already BE the URL being asked for;
 *    navigating to the URL you are on aborts as well. Reload instead.
 */
export async function gotoPortalPath(page: Page, path: string): Promise<void> {
  const url = `${BASE}${path}`
  if (page.url() === url) {
    await page.reload()
    return
  }
  try {
    await page.goto(url)
  } catch (err) {
    if (!String(err).includes('ERR_ABORTED')) throw err
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page.goto(url)
  }
}
