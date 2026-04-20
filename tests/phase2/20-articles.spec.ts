import { test, expect, type Page } from '@playwright/test'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 9 — Admin Articles (BlockNote)
// Covers list + status tabs, create draft, publish, edit (title/slug update),
// unpublish, delete (with Cloudinary cleanup happening in the action but
// verified at the DB/UI layer here).
// The /api/upload route is smoke-tested via a direct request — full inline
// image upload coverage requires a real admin session cookie, which we get
// from logging in first and then driving the request from the browser.
// Requires: dev server on localhost:3000, seeded admin user.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const ADMIN_EMAIL = 'jozo@udruga-inovatic.hr'
const ADMIN_PASSWORD = 'admin123'
const RUN_ID = Date.now().toString().slice(-6)

const ARTICLE = {
  title: `Test članak ${RUN_ID}`,
  slug: `test-clanak-${RUN_ID}`,
  excerpt: `Sažetak za test članak ${RUN_ID}.`,
  editedTitle: `Test članak AŽURIRAN ${RUN_ID}`,
  editedSlug: `test-clanak-azuriran-${RUN_ID}`,
}

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/prijava`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${BASE}/admin`, { timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

test.describe.configure({ mode: 'serial' })

test.describe('Admin — Articles', () => {
  test('upload route rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upload`, {
      multipart: {
        file: {
          name: 'test.png',
          mimeType: 'image/png',
          // 1x1 transparent PNG
          buffer: Buffer.from(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082',
            'hex',
          ),
        },
      },
    })
    expect(res.status()).toBe(401)
  })

  test('create a draft article', async ({ page }) => {
    await loginAsAdmin(page)

    // Visiting /nova creates the draft server-side and redirects to the edit view.
    await page.goto(`${BASE}/admin/novosti/nova`)
    await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Uredi članak' })).toBeVisible()

    // Auto-save kicks in as we type. Replace the placeholder title + excerpt,
    // and rewrite the auto-generated skica-* slug to a deterministic value so
    // downstream tests can target it.
    await page.locator('#article-title').fill(ARTICLE.title)
    await page.locator('#article-slug').fill(ARTICLE.slug)
    await page.locator('#article-excerpt').fill(ARTICLE.excerpt)

    // Wait until the debounced save lands ("Spremljeno u HH:MM:SS").
    await expect(page.getByText(/Spremljeno u/)).toBeVisible({ timeout: 10000 })
  })

  test('article shows in list as draft and NOT on public /novosti', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/novosti?status=DRAFT&search=${encodeURIComponent(ARTICLE.title)}`)
    await expect(page.getByText(ARTICLE.title)).toBeVisible()
    // Status chip "Skica" on the row (the "Skice" tab matches too, so be exact).
    await expect(page.getByText('Skica', { exact: true })).toBeVisible()

    // Public listing should NOT include it
    await page.goto(`${BASE}/novosti`)
    await expect(page.getByText(ARTICLE.title)).toHaveCount(0)
  })

  test('publish the article via edit form', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
    await page.getByRole('link', { name: ARTICLE.title }).click()
    await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/)

    await page.getByRole('button', { name: 'Objavi članak' }).click()

    // "Prvi put objavljeno" timestamp appears
    await expect(page.getByText(/Prvi put objavljeno/)).toBeVisible({ timeout: 10000 })

    // Now on the admin list it's labelled Objavljen (status chip — the
    // "Objavljeni" tab and "Objavljeno" column header also contain that stem).
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
    await expect(page.getByText('Objavljen', { exact: true })).toBeVisible()

    // And the public detail page renders
    await page.goto(`${BASE}/novosti/${ARTICLE.slug}`)
    await expect(page.getByRole('heading', { name: ARTICLE.title })).toBeVisible()
  })

  test('edit title + slug and preserve publishedAt', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
    await page.getByRole('link', { name: ARTICLE.title }).click()

    // Capture the publishedAt text before edit
    const publishedLine = page.getByText(/Prvi put objavljeno/)
    const before = await publishedLine.textContent()

    await page.locator('#article-title').fill(ARTICLE.editedTitle)
    // Slug doesn't auto-update on published articles — touch it manually
    await page.locator('#article-slug').fill(ARTICLE.editedSlug)

    // Wait for auto-save to land
    await expect(page.getByText(/Spremljeno u/)).toBeVisible({ timeout: 10000 })

    // publishedAt line should be unchanged after save
    await page.reload()
    await expect(page.getByText(/Prvi put objavljeno/)).toHaveText(before ?? '')
  })

  test('unpublish hides from public listing', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.editedTitle)}`)
    await page.getByRole('link', { name: ARTICLE.editedTitle }).click()

    await page.getByRole('button', { name: 'Povuci objavu' }).click()

    // Wait for the button to flip back, which signals the server op finished.
    await expect(page.getByRole('button', { name: 'Objavi članak' })).toBeVisible({
      timeout: 10000,
    })

    await page.goto(`${BASE}/novosti`)
    await expect(page.getByText(ARTICLE.editedTitle)).toHaveCount(0)
  })

  test('delete article hard-removes it', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.editedTitle)}`)
    await page.getByRole('link', { name: ARTICLE.editedTitle }).click()

    // Delete button at the top of the edit page
    await page.getByRole('button', { name: 'Obriši' }).first().click()
    await page.getByRole('button', { name: 'Obriši trajno' }).click()

    // The client-side redirect into /admin/novosti can race with the dialog
    // close; rather than waitForURL here, re-navigate and assert the row is
    // gone (either works — this just avoids a flaky URL race).
    await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.editedTitle)}`)
    await expect(page.getByText(ARTICLE.editedTitle)).toHaveCount(0)
  })

  // ─── New draft-first / auto-save / tags UX tests ─────────────────────────
  // Each of these creates its own throwaway draft so the main lifecycle
  // above is unaffected and they can run independently of one another.

  async function createDraftAndGetEditUrl(page: Page): Promise<string> {
    await page.goto(`${BASE}/admin/novosti/nova`)
    await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Uredi članak' })).toBeVisible()
    return page.url()
  }

  async function deleteCurrentDraft(page: Page) {
    await page.getByRole('button', { name: 'Obriši' }).first().click()
    await page.getByRole('button', { name: 'Obriši trajno' }).click()
    // Wait for the dialog to close rather than for URL change — the redirect
    // can race with the transition.
    await expect(page.getByRole('button', { name: 'Obriši trajno' })).toBeHidden({
      timeout: 10000,
    })
  }

  test('tags picker — chips visible by default, click promotes to pill', async ({ page }) => {
    await loginAsAdmin(page)
    await createDraftAndGetEditUrl(page)

    const tagsCard = page.locator('aside > div').filter({ has: page.getByRole('heading', { name: 'Oznake' }) })

    // Dashed "+" chips for existing tags must be present without typing.
    // Skip gracefully if the seed has no tags yet.
    const chips = tagsCard.locator('button.border-dashed')
    const initialCount = await chips.count()
    test.skip(initialCount === 0, 'No existing tags in DB; skipping chip-picker test')

    const firstChipText = ((await chips.first().textContent()) ?? '')
      .replace(/^\s*\+\s*/, '')
      .trim()

    await chips.first().click()

    // Pill appears (cyan background) with the tag name; chip for the same
    // tag disappears from the grid.
    await expect(
      tagsCard.locator('span.bg-cyan-50', { hasText: firstChipText }),
    ).toBeVisible()
    await expect(
      tagsCard.locator('button.border-dashed', { hasText: firstChipText }),
    ).toHaveCount(0)

    // Wait for the debounced auto-save to land so the tag association is
    // persisted before we delete the draft (ensures no transient state).
    await expect(page.getByText(/Spremljeno u/)).toBeVisible({ timeout: 10000 })

    await deleteCurrentDraft(page)
  })

  test('auto-save stays silent when there are no edits', async ({ page }) => {
    await loginAsAdmin(page)
    const editUrl = await createDraftAndGetEditUrl(page)

    // Let the initial page-load network activity settle.
    await page.waitForLoadState('networkidle')

    // Count any POSTs that target the edit route (Server Actions post back
    // to the current URL with a next-action header).
    let serverActionPosts = 0
    const onRequest = (req: import('@playwright/test').Request) => {
      if (req.method() === 'POST' && req.url().startsWith(editUrl)) {
        serverActionPosts++
      }
    }
    page.on('request', onRequest)

    // Sit idle for 6 seconds without touching anything.
    await page.waitForTimeout(6000)
    page.off('request', onRequest)

    expect(serverActionPosts).toBe(0)

    await deleteCurrentDraft(page)
  })
})
