import { test, expect } from '@playwright/test'
import { BASE } from './shared'
import { WP_REDIRECTS } from '../../src/lib/wp-redirects'
import wpPostSlugs from '../fixtures/wp-post-slugs.json'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEGACY WORDPRESS URL REDIRECTS
// The old WordPress site served posts and pages from the domain root. After
// cutover those URLs live on in social media posts, backlinks, and Google —
// the root [slug] route must permanently redirect every one of them.
// Fixture: tests/fixtures/wp-post-slugs.json — all 70 slug-identical post
// URLs captured from the LIVE wp-sitemap on 2026-07-17. Map entries (renamed
// articles + WP-only pages) come straight from src/lib/wp-redirects.ts.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Location headers may come back relative or absolute — compare as path+query. */
function locationPath(location: string | undefined): string {
  if (!location) return '(no location header)'
  const url = new URL(location, BASE)
  return url.pathname + url.search
}

test.describe('Legacy WordPress URLs — permanent redirects', () => {
  test('all 70 migrated WP post URLs redirect to /novosti/{slug}', async ({ page }) => {
    test.setTimeout(120000)
    for (const slug of wpPostSlugs) {
      const resp = await page.request.get(`${BASE}/${slug}`, { maxRedirects: 0 })
      expect.soft(resp.status(), `/${slug} should 308`).toBe(308)
      expect
        .soft(locationPath(resp.headers()['location']), `/${slug} target`)
        .toBe(`/novosti/${slug}`)
    }
  })

  test('every WP page/alias map entry redirects to its mapped target', async ({ page }) => {
    test.setTimeout(120000)
    for (const [slug, target] of Object.entries(WP_REDIRECTS)) {
      const resp = await page.request.get(`${BASE}/${slug}`, { maxRedirects: 0 })
      expect.soft(resp.status(), `/${slug} should 308`).toBe(308)
      expect
        .soft(locationPath(resp.headers()['location']), `/${slug} target`)
        .toBe(target)
    }
  })

  test('renamed-article aliases land on the shortened /novosti slugs', async ({ page }) => {
    const renamed: Array<[string, string]> = [
      [
        'inovatic-ostvario-povijesni-uspjeh-na-drzavnom-finalu-world-robot-olympiad-pet-trofeja-europski-i-svjetski-plasman',
        '/novosti/wro-2026-drzavno-finale',
      ],
      [
        'zavrsena-jos-jedna-uspjesna-skolska-godina-radionica-robotike-udruge-inovatic',
        '/novosti/zavrsena-skolska-godina-radionica-robotike',
      ],
    ]
    for (const [slug, target] of renamed) {
      const resp = await page.request.get(`${BASE}/${slug}`, { maxRedirects: 0 })
      expect(resp.status(), `/${slug} should 308`).toBe(308)
      expect(locationPath(resp.headers()['location'])).toBe(target)
    }
  })

  test('social-media tracking params still redirect (?fbclid=…)', async ({ page }) => {
    const slug = wpPostSlugs[0]
    const resp = await page.request.get(`${BASE}/${slug}?fbclid=IwAR3test123`, {
      maxRedirects: 0,
    })
    expect(resp.status()).toBe(308)
    expect(locationPath(resp.headers()['location'])).toContain(`/novosti/${slug}`)
  })

  test('unknown root slugs still return 404', async ({ page }) => {
    const resp = await page.request.get(`${BASE}/ovaj-slug-nikad-nije-postojao-123`, {
      maxRedirects: 0,
    })
    expect(resp.status()).toBe(404)
  })

  test('live static routes are untouched by the catcher', async ({ page }) => {
    for (const path of ['/o-nama', '/donacije', '/politika-privatnosti']) {
      const resp = await page.request.get(`${BASE}${path}`, { maxRedirects: 0 })
      expect.soft(resp.status(), `${path} stays a direct 200`).toBe(200)
    }
  })
})
