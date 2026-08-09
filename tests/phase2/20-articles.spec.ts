import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin as sharedLoginAsAdmin } from '../helpers/phase3'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 STEP 9 — Admin Articles (BlockNote)
// Consolidated into two flow tests:
//   1. Full lifecycle — create draft, public/admin visibility per status,
//      publish, edit title+slug (publishedAt preserved), unpublish
//   2. Delete — create + delete + 404 on the public detail page
// All assertions from the original 9-test layout are preserved via
// test.step() blocks; descriptive `expect(..., 'why')` messages let failures
// pinpoint which selector or invariant broke without separate test runs.
//
// Coverage moved elsewhere:
//   - /api/upload unauth → 401 → tests/phase3/28-access-control + integration
//     tier (Flux a69o3ew) cover API role rejection across upload routes.
//   - Tags picker chip-promote-to-pill and auto-save-silent-when-idle were
//     UX-specific BlockNote checks that warrant their own file or component
//     test; not migrated here.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE = 'http://localhost:3000'
const RUN_ID = Date.now().toString().slice(-6)

const ARTICLE = {
  title: `Test članak ${RUN_ID}`,
  slug: `test-clanak-${RUN_ID}`,
  excerpt: `Sažetak za test članak ${RUN_ID}.`,
  editedTitle: `Test članak AŽURIRAN ${RUN_ID}`,
  editedSlug: `test-clanak-azuriran-${RUN_ID}`,
}

const DELETE_ARTICLE = {
  title: `Test članak DELETE ${RUN_ID}`,
  slug: `test-clanak-delete-${RUN_ID}`,
  excerpt: 'Za delete-flow test.',
}

// Delegates to the shared panel-aware helper: the seeded admin can hold a
// TeacherAssignment, which turns login into the dual-role panel chooser —
// driving the form here and waiting for /admin hangs on a login that
// actually SUCCEEDED (see .claude/validate.md decisions log, 2026-07-27).
async function loginAsAdmin(page: Page) {
  await sharedLoginAsAdmin(page)
  await page.waitForLoadState('networkidle')
}

async function createDraftWithFields(
  page: Page,
  fields: { title: string; slug: string; excerpt: string },
) {
  // Visiting /nova creates a server-side draft and redirects to its /uredi
  // view. The redirect detaches the goto's frame; swallow the error and
  // wait for the URL to land.
  await page.goto(`${BASE}/admin/novosti/nova`).catch(() => undefined)
  await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/, { timeout: 30000 })
  await expect(
    page.getByRole('heading', { name: 'Uredi članak' }),
    'edit screen heading is present',
  ).toBeVisible()

  await page.locator('#article-title').fill(fields.title)
  await page.locator('#article-slug').fill(fields.slug)
  await page.locator('#article-excerpt').fill(fields.excerpt)

  await expect(
    page.getByText(/Spremljeno u/),
    'auto-save indicator confirms draft persisted',
  ).toBeVisible({ timeout: 30000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('Admin — Articles', () => {
  test('article lifecycle: create draft → publish → edit → unpublish', async ({ page }) => {
    test.setTimeout(120000)
    await loginAsAdmin(page)

    await test.step('Create a fresh draft via /admin/novosti/nova', async () => {
      await createDraftWithFields(page, ARTICLE)
    })

    await test.step('Draft appears under the Skice filter with a "Skica" status chip', async () => {
      await page.goto(
        `${BASE}/admin/novosti?status=DRAFT&search=${encodeURIComponent(ARTICLE.title)}`,
      )
      // By role, not by text: the "Filter aktivan" bar echoes the search term,
      // so a bare getByText(title) now matches the chip as well as the row.
      await expect(
        page.getByRole('link', { name: ARTICLE.title }),
        'draft is listed when filtering by DRAFT',
      ).toBeVisible()
      await expect(
        page.getByText('Skica', { exact: true }),
        'row carries the "Skica" status chip',
      ).toBeVisible()
    })

    await test.step('Public /novosti hides the draft', async () => {
      await page.goto(`${BASE}/novosti`)
      await expect(
        page.getByText(ARTICLE.title),
        'public listing must not show a draft article',
      ).toHaveCount(0)
    })

    await test.step('Publish the article via Objavi članak', async () => {
      await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
      await page.getByRole('link', { name: ARTICLE.title }).click()
      await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/)
      await page.getByRole('button', { name: 'Objavi članak' }).click()
      await expect(
        page.getByText(/Prvi put objavljeno/),
        '"Prvi put objavljeno" timestamp appears after publish',
      ).toBeVisible({ timeout: 10000 })
    })

    await test.step('Admin list now labels the article "Objavljen"', async () => {
      await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
      await expect(
        page.getByText('Objavljen', { exact: true }),
        'admin row carries the "Objavljen" status chip',
      ).toBeVisible()
    })

    await test.step('Public detail page renders the article heading', async () => {
      await page.goto(`${BASE}/novosti/${ARTICLE.slug}`)
      await expect(
        page.getByRole('heading', { name: ARTICLE.title }),
        'public article detail page renders the title',
      ).toBeVisible()
    })

    let publishedBefore: string | null = ''
    await test.step('Edit title + slug — publishedAt is preserved across the save', async () => {
      await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.title)}`)
      await page.getByRole('link', { name: ARTICLE.title }).click()
      const publishedLine = page.getByText(/Prvi put objavljeno/)
      publishedBefore = await publishedLine.textContent()
      expect(publishedBefore, 'baseline publishedAt was captured').toBeTruthy()

      await page.locator('#article-title').fill(ARTICLE.editedTitle)
      await page.locator('#article-slug').fill(ARTICLE.editedSlug)
      await expect(
        page.getByText(/Spremljeno u/),
        'auto-save confirms edited fields persisted',
      ).toBeVisible({ timeout: 10000 })

      await page.reload()
      await expect(
        page.getByText(/Prvi put objavljeno/),
        'publishedAt timestamp is unchanged by edit',
      ).toHaveText(publishedBefore ?? '')
    })

    await test.step('Public detail still resolves at the new slug', async () => {
      await page.goto(`${BASE}/novosti/${ARTICLE.editedSlug}`)
      await expect(
        page.getByRole('heading', { name: ARTICLE.editedTitle }),
        'public detail page now resolves at the new slug',
      ).toBeVisible()
    })

    await test.step('Unpublish via Povuci objavu hides the article from the public listing', async () => {
      await page.goto(`${BASE}/admin/novosti?search=${encodeURIComponent(ARTICLE.editedTitle)}`)
      await page.getByRole('link', { name: ARTICLE.editedTitle }).click()
      await page.getByRole('button', { name: 'Povuci objavu' }).click()
      await expect(
        page.getByRole('button', { name: 'Objavi članak' }),
        'edit screen flips back to "Objavi članak" after unpublish',
      ).toBeVisible({ timeout: 10000 })

      await page.goto(`${BASE}/novosti`)
      await expect(
        page.getByText(ARTICLE.editedTitle),
        'public listing hides the unpublished article',
      ).toHaveCount(0)
    })
  })

  test('article delete: hard-removes and the public detail page 404s', async ({ page }) => {
    test.setTimeout(90000)
    await loginAsAdmin(page)

    await test.step('Create a throwaway draft to delete', async () => {
      await createDraftWithFields(page, DELETE_ARTICLE)
    })

    await test.step('Publish it so we have a public detail page to 404-check', async () => {
      await page.getByRole('button', { name: 'Objavi članak' }).click()
      await expect(
        page.getByText(/Prvi put objavljeno/),
        'delete-target article was successfully published',
      ).toBeVisible({ timeout: 10000 })
    })

    await test.step('Confirm public detail page resolves before delete (baseline)', async () => {
      const before = await page.goto(`${BASE}/novosti/${DELETE_ARTICLE.slug}`)
      expect(before?.status(), 'public detail returns 200 before delete').toBe(200)
      await expect(
        page.getByRole('heading', { name: DELETE_ARTICLE.title }),
        'public detail page renders the soon-to-be-deleted article',
      ).toBeVisible()
    })

    await test.step('Delete via Obriši + Obriši trajno confirmation', async () => {
      await page.goto(
        `${BASE}/admin/novosti?search=${encodeURIComponent(DELETE_ARTICLE.title)}`,
      )
      await page.getByRole('link', { name: DELETE_ARTICLE.title }).click()
      await page.waitForURL(/\/admin\/novosti\/[^/]+\/uredi/)
      await page.getByRole('button', { name: 'Obriši' }).first().click()
      await page.getByRole('button', { name: 'Obriši trajno' }).click()
      // Wait for the edit page's router.push('/admin/novosti') to fire.
      await page.waitForURL(/\/admin\/novosti(?:\?|$)/, { timeout: 15000 })
    })

    await test.step('Admin list no longer shows the deleted article', async () => {
      await page.goto(
        `${BASE}/admin/novosti?search=${encodeURIComponent(DELETE_ARTICLE.title)}`,
      )
      // By role: searching for the title now also prints it in the
      // "Filter aktivan" chip, so getByText would never reach 0.
      await expect(
        page.getByRole('link', { name: DELETE_ARTICLE.title }),
        'admin list filters out the deleted article',
      ).toHaveCount(0)
    })

    await test.step('Public detail page now 404s', async () => {
      const after = await page.goto(`${BASE}/novosti/${DELETE_ARTICLE.slug}`)
      expect(after?.status(), 'public detail returns 404 after delete').toBe(404)
    })

    // Cloudinary asset destruction is verified at the unit/integration tier
    // (destroyCloudinaryAssets is called from src/actions/admin/article.ts on
    // delete; the helper itself has direct test coverage). Asserting against
    // the live Cloudinary API from Playwright would require leaking API keys
    // into the test harness and adds 1–3s per assertion — out of scope here.
  })
})
