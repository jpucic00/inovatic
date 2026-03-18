import { test, expect } from '@playwright/test'
import { BASE, ALL_PAGES } from './shared'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEO — META TAGS, OG IMAGES, SITEMAP, ROBOTS, JSON-LD
// Validates that every public page has proper SEO meta tags (description,
// OG title/description/image). Also checks sitemap, robots.txt, article-
// specific OG tags, and JSON-LD structured data.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('SEO — Meta tags and Open Graph on every public page', () => {
  for (const p of ALL_PAGES) {
    test(`${p.name} (${p.path}) — has meta description, og:title, og:description, og:image`, async ({ page }) => {
      await test.step(`Navigate to ${p.path}`, async () => {
        await page.goto(`${BASE}${p.path}`)
      })

      await test.step('Verify <meta name="description"> exists and is at least 30 characters', async () => {
        const metaDesc = await page.getAttribute('meta[name="description"]', 'content')
        expect(metaDesc, `${p.path} should have a meta description`).toBeTruthy()
        expect(metaDesc!.length, `${p.path} meta description should be at least 30 chars`).toBeGreaterThanOrEqual(30)
      })

      await test.step('Verify og:title meta tag exists and is not empty', async () => {
        const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content')
        expect(ogTitle, `${p.path} should have og:title`).toBeTruthy()
      })

      await test.step('Verify og:description meta tag exists and is not empty', async () => {
        const ogDesc = await page.getAttribute('meta[property="og:description"]', 'content')
        expect(ogDesc, `${p.path} should have og:description`).toBeTruthy()
      })

      await test.step('Verify og:image meta tag exists and references the OG image', async () => {
        const ogImage = await page.getAttribute('meta[property="og:image"]', 'content')
        expect(ogImage, `${p.path} should have og:image`).toBeTruthy()
        expect(ogImage, `${p.path} og:image should reference opengraph-image`).toContain('opengraph-image')
      })
    })
  }
})

test.describe('SEO — Sitemap, robots.txt, article OG tags, and JSON-LD', () => {
  test('Sitemap.xml is accessible and contains a valid <urlset>', async ({ page }) => {
    await test.step('Fetch /sitemap.xml and verify HTTP 200', async () => {
      const response = await page.goto(`${BASE}/sitemap.xml`)
      expect(response?.status()).toBe(200)
    })

    await test.step('Verify the response body contains <urlset> (valid sitemap XML)', async () => {
      const content = await page.content()
      expect(content).toContain('urlset')
    })
  })

  test('Robots.txt is accessible, allows public routes, and blocks private routes', async ({ page }) => {
    await test.step('Fetch /robots.txt and verify HTTP 200', async () => {
      const response = await page.goto(`${BASE}/robots.txt`)
      expect(response?.status()).toBe(200)
    })

    await test.step('Verify robots.txt contains User-Agent directive', async () => {
      const text = await page.locator('body').textContent()
      expect(text).toContain('User-Agent')
    })

    await test.step('Verify robots.txt blocks admin, portal, and teacher routes', async () => {
      const text = await page.locator('body').textContent()
      expect(text, 'Should block /admin/').toContain('/admin/')
      expect(text, 'Should block /portal/').toContain('/portal/')
      expect(text, 'Should block /nastavnik/').toContain('/nastavnik/')
    })

    await test.step('Verify robots.txt includes a Sitemap reference', async () => {
      const text = await page.locator('body').textContent()
      expect(text, 'Should reference sitemap.xml').toContain('sitemap.xml')
    })
  })

  test('Article detail pages have article-specific OG tags (title, type="article")', async ({ page }) => {
    await test.step('Navigate to /novosti and find the first article link', async () => {
      await page.goto(`${BASE}/novosti`)
    })

    let href: string | null = null
    await test.step('Extract the first article href', async () => {
      href = await page.locator('a[href*="/novosti/"]').first().getAttribute('href')
      expect(href).toBeTruthy()
    })

    await test.step('Navigate to the article detail page', async () => {
      const url = href!.startsWith('http') ? href! : `${BASE}${href}`
      await page.goto(url)
    })

    await test.step('Verify og:title is set to the article title', async () => {
      const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content')
      expect(ogTitle, 'Article should have og:title').toBeTruthy()
    })

    await test.step('Verify og:type is set to "article"', async () => {
      const ogType = await page.getAttribute('meta[property="og:type"]', 'content')
      expect(ogType, 'Article og:type should be "article"').toBe('article')
    })
  })

  test('Homepage has JSON-LD structured data with @type "EducationalOrganization"', async ({ page }) => {
    await test.step('Navigate to the homepage', async () => {
      await page.goto(BASE)
    })

    await test.step('Find <script type="application/ld+json"> tags in the DOM', async () => {
      const jsonLd = page.locator('script[type="application/ld+json"]')
      const count = await jsonLd.count()
      expect(count, 'Should have at least 1 JSON-LD script').toBeGreaterThan(0)
    })

    await test.step('Parse JSON-LD and verify @type is "EducationalOrganization"', async () => {
      const jsonLd = page.locator('script[type="application/ld+json"]').first()
      const content = await jsonLd.textContent()
      const parsed = JSON.parse(content || '{}')
      expect(parsed['@type'], 'JSON-LD @type should be EducationalOrganization').toBe('EducationalOrganization')
    })
  })
})
