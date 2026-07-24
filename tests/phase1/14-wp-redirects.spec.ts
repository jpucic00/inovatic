import { test, expect } from '@playwright/test'
import { BASE } from './shared'
import { WP_REDIRECTS } from '../../src/lib/wp-redirects'
import wpPostSlugs from '../fixtures/wp-post-slugs.json'
import wpCompetitionPages from '../fixtures/wp-competition-pages.json'

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

  // These 20 were WP *pages*, so they are absent from the posts fixture, and
  // 19 of them are deliberately absent from WP_REDIRECTS too (an entry would
  // shadow the article, since the map is consulted before the DB lookup) —
  // which leaves the two tests above blind to them. Cover them explicitly.
  test('all 20 migrated WP competition pages redirect to their article', async ({ page }) => {
    test.setTimeout(120000)
    for (const { wp, article } of wpCompetitionPages) {
      const resp = await page.request.get(`${BASE}/${wp}`, { maxRedirects: 0 })
      expect.soft(resp.status(), `/${wp} should 308`).toBe(308)
      expect
        .soft(locationPath(resp.headers()['location']), `/${wp} target`)
        .toBe(`/novosti/${article}`)
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

  // WordPress permalinks always end in a slash, so this — not the bare slug —
  // is the shape every old Facebook share actually carries. Next strips the
  // slash first, making it a two-hop chain; both hops must survive.
  test('WordPress trailing-slash links reach the article', async ({ page }) => {
    const cases = [
      { from: `/${wpPostSlugs[0]}/`, to: `/novosti/${wpPostSlugs[0]}` },
      { from: '/robokup-drzavno-2019/', to: '/novosti/robokup-drzavno-2019' },
      { from: '/2069-2/?fbclid=IwZXh0bgNhZW0', to: '/novosti/62-natjecanje-mladih-tehnicara-zupanijska-razina' },
    ]
    for (const { from, to } of cases) {
      const resp = await page.request.get(`${BASE}${from}`)
      expect.soft(resp.status(), `${from} should end at 200`).toBe(200)
      expect.soft(new URL(resp.url()).pathname, `${from} final URL`).toBe(to)
    }
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
