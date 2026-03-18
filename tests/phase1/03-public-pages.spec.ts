import { test, expect } from '@playwright/test'
import { BASE } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC PAGES — HTTP STATUS
// Verifies that every public route returns HTTP 200 (no server errors or
// missing pages). Covers the homepage, all 4 course detail pages, about,
// news, inquiry form, contact, and birthday parties.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Public Pages — All routes return HTTP 200', () => {
  const pages = [
    { path: '/', name: 'Homepage' },
    { path: '/programi', name: 'Programs listing — overview of all 4 SLR levels' },
    { path: '/programi/slr-1', name: 'SLR 1 — Beginner course (ages 6–8)' },
    { path: '/programi/slr-2', name: 'SLR 2 — Intermediate course (ages 8–10)' },
    { path: '/programi/slr-3', name: 'SLR 3 — Advanced course (ages 10–12)' },
    { path: '/programi/slr-4', name: 'SLR 4 — Expert course (ages 12–14)' },
    { path: '/o-nama', name: 'About — Association history, team, mission' },
    { path: '/novosti', name: 'News — Paginated article listing' },
    { path: '/upisi', name: 'Inquiry form — Multi-step parent registration' },
    { path: '/kontakt', name: 'Contact — Locations, phone, email' },
    { path: '/proslave', name: 'Birthday parties — LEGO robotics celebrations' },
  ]

  for (const p of pages) {
    test(`${p.name} (${p.path})`, async ({ page }) => {
      await test.step(`Send GET request to ${p.path}`, async () => {
        const response = await page.goto(`${BASE}${p.path}`)
        expect(response?.status(), `${p.path} should return HTTP 200`).toBe(200)
      })
    })
  }
})
