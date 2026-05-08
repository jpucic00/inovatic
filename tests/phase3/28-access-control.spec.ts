import { test, expect } from '@playwright/test'
import {
  BASE,
  loginAsAdmin,
  loginWithEmail,
  pickFirstGroupId,
  createTeacher,
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
