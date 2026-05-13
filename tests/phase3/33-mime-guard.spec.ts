import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  loginAsAdmin,
  loginWithEmail,
  createTeacher,
  type TeacherData,
} from '../helpers/phase3'

const RUN_ID = Date.now().toString().slice(-6)
const SAMPLE_PNG = path.resolve(__dirname, '../fixtures/sample.png')

const TEACHER: TeacherData = {
  firstName: 'Ana',
  lastName: `MimeGrd${RUN_ID}`,
  email: `ana.mimegrd.${RUN_ID}@test.com`,
  phone: '0916660001',
}

// First 12 bytes of a valid PNG — used as a spoofed payload for JPEG tests
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]

type Seeded = { teacher: { email: string; password: string } }
let seeded: Seeded | null = null

test.describe.configure({ mode: 'serial' })

test.describe('MIME guard — drop SVG + magic-byte sniff', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60000)
    const page = await browser.newPage()
    await loginAsAdmin(page)
    const t = await createTeacher(page, TEACHER)
    seeded = { teacher: { email: TEACHER.email, password: t.password } }
    await page.close()
  })

  // ── SVG rejection ─────────────────────────────────────────────────────────────

  test('/api/upload rejects SVG → 415 (articles route, admin)', async ({ page }) => {
    await loginAsAdmin(page)
    const status = await page.evaluate(async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
      const form = new FormData()
      form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'x.svg')
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  test('/api/upload/materials rejects SVG → 415', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const status = await page.evaluate(async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
      const form = new FormData()
      form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'x.svg')
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  test('/api/upload/gallery still rejects SVG → 415 (regression guard)', async ({ page }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const status = await page.evaluate(async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
      const form = new FormData()
      form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'x.svg')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      return res.status
    })
    expect(status).toBe(415)
  })

  // ── Magic-byte mismatch ───────────────────────────────────────────────────────

  test('/api/upload rejects spoofed JPEG (PNG magic, image/jpeg declared) → 415', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    const status = await page.evaluate(async (head: number[]) => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(head)], { type: 'image/jpeg' }), 'x.jpg')
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      return res.status
    }, PNG_HEAD)
    expect(status).toBe(415)
  })

  test('/api/upload/gallery rejects spoofed JPEG (PNG magic, image/jpeg declared) → 415', async ({
    page,
  }) => {
    if (!seeded) throw new Error('not seeded')
    await loginWithEmail(page, seeded.teacher.email, seeded.teacher.password)
    await page.waitForURL(/\/nastavnik/, { timeout: 30000 })
    const status = await page.evaluate(async (head: number[]) => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(head)], { type: 'image/jpeg' }), 'x.jpg')
      const res = await fetch('/api/upload/gallery', { method: 'POST', body: form })
      return res.status
    }, PNG_HEAD)
    expect(status).toBe(415)
  })

  // ── Legitimate upload passes the guard ────────────────────────────────────────

  test('/api/upload accepts a legitimate PNG → 200 (magic-byte check passes through)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    const pngBase64 = fs.readFileSync(SAMPLE_PNG).toString('base64')
    await loginAsAdmin(page)
    const status = await page.evaluate(async (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'image/png' }), 'sample.png')
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      return res.status
    }, pngBase64)
    expect(status).toBe(200)
  })
})
