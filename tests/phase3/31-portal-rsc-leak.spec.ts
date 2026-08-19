import { test, expect, type Page } from '@playwright/test'
import {
  BASE,
  loginWithEmail,
  collectGroupIds,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'
import {
  seedTeacher,
  seedTeacherAssignment,
  seedStudentInGroup,
} from '../helpers/seed'
import { db } from '@/lib/db'

import { cleanupRunFixtures } from '../helpers/cleanup'
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3 — Portal RSC payload leak guard.
//
// 26-comments.spec.ts already asserts that visible body text on /portal pages
// hides teacher comments. That check uses `innerText()`, which excludes
// <script> content — so it does NOT catch the failure mode where a Server
// Component fetches a student record with `include: { studentComments: true,
// enrollments: { include: { attendances: true } } }` and passes it as a prop
// across the server/client boundary. Even if nothing renders those fields,
// the React Server Components flight payload (self.__next_f.push(...)) ships
// the underlying objects inline in the HTML, where any logged-in student can
// read them via DevTools.
//
// This spec seeds a teacher-only comment + an attendance row with a private
// "Bolest" note, logs in as the student, and asserts the rendered HTML
// (page.content() — includes <script> tags) contains none of the staff-only
// fields. If a future loader regresses to include studentComments or raw
// attendance objects, these assertions catch it before merge.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RUN_ID = Date.now().toString().slice(-6)

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
  firstName: 'Ivana',
  lastName: `RscLeak${RUN_ID}`,
  email: `ivana.rscleak.${RUN_ID}@test.com`,
  phone: '0917770001',
}
const STUDENT: StudentData = {
  firstName: 'Marta',
  lastName: `RscLeakKid${RUN_ID}`,
  dateOfBirth: '2016-04-04',
  childSchool: 'OŠ Bačvice',
  parentName: `Roditelj RscLeak ${RUN_ID}`,
  parentEmail: `rscleak.kid.${RUN_ID}@test.com`,
  parentPhone: '0917770002',
}

const COMMENT_BODY = `Aktivna na satu — privatna nastavnička bilješka ${RUN_ID}`
const REVIEW_BODY = `Recenzija modula ${RUN_ID} — savladano, izvrstan rad`
const ATTENDANCE_NOTE = `Bolest ${RUN_ID}`
const SESSION_DATE = new Date('2025-09-01T00:00:00.000Z')

// Tokens that should never appear in the portal HTML. The teacher's name
// itself is intentionally rendered (as `teacherNames` on the group view), so
// it isn't included here — the leak signal is the surrounding RSC shape:
// the staff-only content strings, the note body, and Prisma field/key
// names that would only surface if a loader passed raw rows across the
// server/client boundary.
const FORBIDDEN_HTML_TOKENS = [
  COMMENT_BODY,
  REVIEW_BODY,
  ATTENDANCE_NOTE,
  '"studentComments"',
  '"studentAssessments"',
  '"opisnaOcjena"',
  '"attendances"',
  '"recordedBy"',
  '"sessionDate"',
]

type Seeded = {
  studentLogin: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

async function assertNoStaffLeak(page: Page, path: string) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('domcontentloaded')
  const html = await page.content()
  for (const token of FORBIDDEN_HTML_TOKENS) {
    expect(
      html.includes(token),
      `${path} — full HTML should not contain "${token}" (RSC payload leak)`,
    ).toBe(false)
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 — Portal RSC payload leak guard', () => {
  test.beforeAll(async () => {
    test.setTimeout(120000)
    const [groupId] = collectGroupIds(1)

    const t = await seedTeacher(TEACHER)
    await seedTeacherAssignment(t.teacherId, groupId)

    const s = await seedStudentInGroup(groupId, STUDENT)

    const enrollment = await db.enrollment.findFirstOrThrow({
      where: { userId: s.studentId, scheduledGroupId: groupId },
      select: { id: true },
    })

    await db.studentComment.create({
      data: {
        studentId: s.studentId,
        groupId,
        authorId: t.teacherId,
        content: COMMENT_BODY,
      },
    })
    // Report card — its opisna ocjena must also never leak into portal HTML.
    await db.studentAssessment.create({
      data: {
        studentId: s.studentId,
        groupId,
        authorId: t.teacherId,
        slaganje: 'OSTVARENO',
        opisnaOcjena: REVIEW_BODY,
      },
    })
    await db.attendance.create({
      data: {
        enrollmentId: enrollment.id,
        sessionDate: SESSION_DATE,
        present: false,
        note: ATTENDANCE_NOTE,
        recordedById: t.teacherId,
      },
    })

    seeded = {
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
      groupId,
    }
  })

  test('staff-only fields do not leak into portal RSC payload', async ({ page }) => {
    test.setTimeout(120000)
    if (!seeded) throw new Error('not seeded')

    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    await assertNoStaffLeak(page, '/portal')
    await assertNoStaffLeak(page, `/portal/grupa/${seeded.groupId}`)
    await assertNoStaffLeak(page, `/portal/grupa/${seeded.groupId}/galerija`)
    await assertNoStaffLeak(page, '/portal/profil')
  })
})
