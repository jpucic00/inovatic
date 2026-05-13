import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickFirstGroupId,
  createTeacher,
  assignTeacherToGroup,
  createStudentInGroup,
  expectNotFoundPage,
  type TeacherData,
  type StudentData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)

const TEACHER: TeacherData = {
  firstName: 'Roko',
  lastName: `ACL${RUN_ID}`,
  email: `roko.acl.${RUN_ID}@test.com`,
  phone: '0915550001',
}
const STUDENT: StudentData = {
  firstName: 'Ines',
  lastName: `ACLKid${RUN_ID}`,
  dateOfBirth: '2016-02-02',
  childSchool: 'OŠ ACL',
  parentName: `Roditelj ACL ${RUN_ID}`,
  parentEmail: `acl.kid.${RUN_ID}@test.com`,
  parentPhone: '0915556677',
}

type Seeded = {
  teacher: { email: string; password: string }
  studentLogin: { email: string; password: string }
  groupId: string
}
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('Phase 3 Step 16 — Access-control matrix', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const groupId = pickFirstGroupId(page)
    const t = await createTeacher(page, TEACHER)
    const s = await createStudentInGroup(page, groupId, STUDENT)
    seeded = {
      teacher: { email: TEACHER.email, password: t.password },
      studentLogin: {
        email: `${s.username}@student.inovatic.local`,
        password: s.password,
      },
      groupId,
    }
    await page.close()
  })

  test('unauthenticated visitor is redirected from /portal', async ({ page }) => {
    await page.goto(`${BASE}/portal`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('unauthenticated visitor is redirected from /admin', async ({ page }) => {
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('unauthenticated visitor is redirected from /nastavnik', async ({ page }) => {
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('student cannot reach /admin — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('student cannot reach /nastavnik — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher cannot reach /admin — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/admin`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })

  test('teacher without assignment visiting any /nastavnik/grupa/<id> → 404', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/nastavnik/grupa/${seeded.groupId}`)
    await expectNotFoundPage(page)
    await expect(page.getByRole('link', { name: 'Polaznici' })).toHaveCount(0)
  })

  test('/api/upload/materials rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upload/materials`, {
      multipart: {
        file: {
          name: 'hi.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('hi'),
        },
      },
    })
    expect(res.status()).toBe(401)
  })

  test('/api/upload/materials rejects STUDENT cookie', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })

    const status = await page.evaluate(async () => {
      const form = new FormData()
      form.append('file', new Blob(['hi'], { type: 'text/plain' }), 'hi.txt')
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(401)
  })

  // ── I3: Role-based login redirects ─────────────────────────────────────────

  test('teacher login redirects to /nastavnik', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    expect(page.url()).toContain('/nastavnik')
  })

  test('student login redirects to /portal', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.studentLogin.email, seeded.studentLogin.password)
    await page.waitForURL(/\/portal/, { timeout: 30000 })
    expect(page.url()).toContain('/portal')
  })

  // ── I4: Login error state ──────────────────────────────────────────────────

  test('login form shows Croatian error message on invalid credentials', async ({ page }) => {
    await page.goto(`${BASE}/prijava`)
    await page.locator('#identifier').fill('nonexistent@test.com')
    await page.locator('input[type="password"]').fill('wrongpassword123')
    await page.locator('button[type="submit"]').click()
    await expect(
      page.getByText(/Pogrešno korisničko ime ili lozinka/),
    ).toBeVisible({ timeout: 10000 })
  })

  // ── N8: Teacher accessing /portal ──────────────────────────────────────────

  test('teacher cannot reach /portal — guard bounces to /prijava', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    await page.goto(`${BASE}/portal`)
    await page.waitForURL(/\/prijava/, { timeout: 30000 })
    expect(page.url()).toContain('/prijava')
  })
})

// ─── Direct-POST server-action authz ─────────────────────────────────────────

const TEACHER_SA: TeacherData = {
  firstName: 'Sonja',
  lastName: `SA${RUN_ID}`,
  email: `sonja.sa.${RUN_ID}@test.com`,
  phone: '0912220001',
}
const TEACHER_SB: TeacherData = {
  firstName: 'Borna',
  lastName: `SB${RUN_ID}`,
  email: `borna.sb.${RUN_ID}@test.com`,
  phone: '0912220002',
}
const STUDENT_SA: StudentData = {
  firstName: 'Nika',
  lastName: `SAKid${RUN_ID}`,
  dateOfBirth: '2016-05-05',
  childSchool: 'OŠ SA',
  parentName: `Roditelj SA ${RUN_ID}`,
  parentEmail: `sa.kid.${RUN_ID}@test.com`,
  parentPhone: '0912221234',
}

type ActionSeeded = {
  teacherA: { email: string; password: string }
  teacherB: { email: string; password: string }
  studentId: string
  groupAId: string
  createActionId: string
  deleteActionId: string
  commentId: string
}
let actionSeeded: ActionSeeded | null = null

test.describe('Phase 3 — Server-action authz (direct POST)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000)
    const page = await browser.newPage()
    try {
      await loginAsAdmin(page)
      const groupAId = pickFirstGroupId(page)
      const tA = await createTeacher(page, TEACHER_SA)
      const tB = await createTeacher(page, TEACHER_SB)
      await assignTeacherToGroup(page, tA.teacherId, groupAId)
      // Teacher B intentionally has no group assignment
      const s = await createStudentInGroup(page, groupAId, STUDENT_SA)

      await loginWithEmail(page, TEACHER_SA.email, tA.password)
      await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

      const studentUrl = `${BASE}/nastavnik/ucenik/${s.studentId}`
      const SACRIFICE_TEXT = `SA-sacrifice-${RUN_ID}`
      const TARGET_TEXT = `SA-target-${RUN_ID}`

      let createActionId = ''
      let deleteActionId = ''

      // Intercept all POSTs to the student page to capture Next-Action IDs.
      // 1st POST → createActionId, 2nd POST (different ID) → deleteActionId.
      await page.route(studentUrl, async (route, request) => {
        if (request.method() === 'POST') {
          const actionId = request.headers()['next-action'] ?? ''
          if (!createActionId) {
            createActionId = actionId
          } else if (!deleteActionId && actionId !== createActionId) {
            deleteActionId = actionId
          }
        }
        await route.continue()
      })

      // Step 1: create sacrifice comment (captures createActionId)
      await page.goto(studentUrl)
      await page.waitForLoadState('domcontentloaded')
      const ta1 = page.getByPlaceholder(/Napišite komentar/)
      await ta1.waitFor({ state: 'visible', timeout: 30000 })
      await ta1.fill(SACRIFICE_TEXT)
      const sb1 = page.getByRole('button', { name: /Dodaj komentar/ })
      await expect(sb1).toBeEnabled({ timeout: 10000 })
      await sb1.click()
      await expect(page.getByText('Komentar dodan.')).toBeVisible({ timeout: 30000 })
      await expect(page.getByText(SACRIFICE_TEXT)).toBeVisible()

      // Step 2: delete sacrifice comment (captures deleteActionId)
      page.once('dialog', (d) => d.accept())
      const sacrificeArticle = page.locator('article', { hasText: SACRIFICE_TEXT })
      await sacrificeArticle.getByRole('button', { name: 'Izbriši bilješku' }).click()
      await expect(page.getByText('Bilješka izbrisana.')).toBeVisible({ timeout: 15000 })

      // Step 3: create target comment (Teacher B will try to delete this)
      await page.goto(studentUrl)
      await page.waitForLoadState('domcontentloaded')
      const ta2 = page.getByPlaceholder(/Napišite komentar/)
      await ta2.waitFor({ state: 'visible', timeout: 30000 })
      await ta2.fill(TARGET_TEXT)
      const sb2 = page.getByRole('button', { name: /Dodaj komentar/ })
      await expect(sb2).toBeEnabled({ timeout: 10000 })
      await sb2.click()
      await expect(page.getByText('Komentar dodan.')).toBeVisible({ timeout: 30000 })
      await expect(page.getByText(TARGET_TEXT)).toBeVisible()

      // Step 4: extract target comment ID via React fiber (dev mode only)
      const commentId = await page.evaluate((text: string) => {
        const articles = document.querySelectorAll('article')
        for (const article of articles) {
          if (!article.textContent?.includes(text)) continue
          const fiberProp = Object.keys(article).find((k) =>
            k.startsWith('__reactFiber'),
          )
          if (!fiberProp) return null
          const fiber = (article as unknown as Record<string, unknown>)[fiberProp] as
            | { key?: unknown }
            | null
            | undefined
          return fiber?.key != null ? String(fiber.key) : null
        }
        return null
      }, TARGET_TEXT)

      await page.unroute(studentUrl)

      if (!createActionId) throw new Error('createActionId not captured')
      if (!deleteActionId) throw new Error('deleteActionId not captured')
      if (!commentId) throw new Error('commentId not extracted via React fiber')

      actionSeeded = {
        teacherA: { email: TEACHER_SA.email, password: tA.password },
        teacherB: { email: TEACHER_SB.email, password: tB.password },
        studentId: s.studentId,
        groupAId,
        createActionId,
        deleteActionId,
        commentId,
      }
    } finally {
      await page.close()
    }
  })

  test('createTeacherComment direct-POST returns 404 when Teacher B is not assigned to the group', async ({ page }) => {
    test.setTimeout(60000)
    if (!actionSeeded) throw new Error('not seeded')

    await loginWithEmail(page, actionSeeded.teacherB.email, actionSeeded.teacherB.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const status = await page.evaluate(
      async (args: { actionId: string; groupId: string; studentId: string }) => {
        const res = await fetch(`/nastavnik/ucenik/${args.studentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': args.actionId,
          },
          body: JSON.stringify([
            { groupId: args.groupId, studentId: args.studentId, content: 'Spoof', type: 'COMMENT' },
          ]),
        })
        return res.status
      },
      {
        actionId: actionSeeded.createActionId,
        groupId: actionSeeded.groupAId,
        studentId: actionSeeded.studentId,
      },
    )

    expect(status).toBe(404)
  })

  test('deleteTeacherComment direct-POST returns { success: false } when Teacher B targets Teacher A\'s comment', async ({ page }) => {
    test.setTimeout(60000)
    if (!actionSeeded) throw new Error('not seeded')

    await loginWithEmail(page, actionSeeded.teacherB.email, actionSeeded.teacherB.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })

    const result = await page.evaluate(
      async (args: { actionId: string; commentId: string; studentId: string }) => {
        const res = await fetch(`/nastavnik/ucenik/${args.studentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Next-Action': args.actionId,
          },
          body: JSON.stringify([args.commentId]),
        })
        return { status: res.status, body: await res.text() }
      },
      {
        actionId: actionSeeded.deleteActionId,
        commentId: actionSeeded.commentId,
        studentId: actionSeeded.studentId,
      },
    )

    expect(result.status).toBe(200)
    expect(result.body).toContain('"success":false')
  })
})
