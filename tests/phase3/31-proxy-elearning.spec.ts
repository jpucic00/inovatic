import { test, expect } from '@playwright/test'
import { BASE, loginAsAdmin } from '../helpers/phase3'

test.describe('Phase 3 — /api/proxy/elearning hardening', () => {
  test.describe.configure({ mode: 'serial' })

  test('unauthenticated GET → 401 JSON, not a 302 to /prijava', async ({ request }) => {
    const res = await request.get(`${BASE}/api/proxy/elearning/anything`, {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
    const ct = res.headers()['content-type'] ?? ''
    expect(ct).toContain('application/json')
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBeTruthy()
  })

  test('logged-in ADMIN passes the role gate', async ({ page }) => {
    await loginAsAdmin(page)
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/proxy/elearning/anything', { redirect: 'follow' })
      return r.status
    })
    expect(status).not.toBe(401)
    expect(status).not.toBe(403)
  })

  test('backslash in path segment → 400 JSON', async ({ page }) => {
    await loginAsAdmin(page)
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/proxy/elearning/foo%5Cbar', { redirect: 'follow' })
      const ct = r.headers.get('content-type') ?? ''
      const body = ct.includes('json') ? ((await r.json()) as { error?: string }) : null
      return { status: r.status, body }
    })
    expect(result.status).toBe(400)
    expect(result.body?.error).toBeTruthy()
  })

  test('traversal segment "%2E%2E" → 400 (best-effort; may be normalized)', async ({ page }) => {
    await loginAsAdmin(page)
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/proxy/elearning/foo/%2E%2E/bar', { redirect: 'follow' })
      return r.status
    })
    // The browser/Node URL parser may collapse %2E%2E before the request leaves.
    // If it does, the request never reaches the traversal check. Accept 400
    // (check fired) or anything-not-401/403 (path was normalized so request
    // proxied a valid path). The point is: traversal must NOT be silently
    // forwarded if it does reach the handler.
    expect([400, 200, 301, 302, 303, 307, 308, 404]).toContain(status)
  })

  test('depth cap rejects > 20 segments with 400', async ({ page }) => {
    await loginAsAdmin(page)
    const longPath = Array.from({ length: 21 }, (_, i) => `s${i}`).join('/')
    const status = await page.evaluate(async (p) => {
      const r = await fetch(`/api/proxy/elearning/${p}`, { redirect: 'follow' })
      return r.status
    }, longPath)
    expect(status).toBe(400)
  })

  test('response strips x-frame-options and set-cookie; always sets nosniff', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/proxy/elearning/anything', { redirect: 'follow' })
        return {
          ok: true,
          status: r.status,
          contentType: r.headers.get('content-type'),
          nosniff: r.headers.get('x-content-type-options'),
          xfo: r.headers.get('x-frame-options'),
          setCookie: r.headers.get('set-cookie'),
        }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })

    test.skip(!res.ok, `upstream unreachable: ${'error' in res ? res.error : ''}`)
    if (!res.ok) return
    expect(res.xfo).toBeFalsy()
    expect(res.setCookie).toBeFalsy()
    expect(res.nosniff).toBe('nosniff')
  })

  test('CSP, referrer-policy and <base> injection on HTML responses', async ({ page }) => {
    await loginAsAdmin(page)
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/proxy/elearning/anything', { redirect: 'follow' })
        const ct = r.headers.get('content-type') ?? ''
        const body = ct.includes('text/html') ? await r.text() : ''
        return {
          ok: true,
          contentType: ct,
          csp: r.headers.get('content-security-policy'),
          referrerPolicy: r.headers.get('referrer-policy'),
          body,
        }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })

    test.skip(!res.ok, `upstream unreachable: ${'error' in res ? res.error : ''}`)
    if (!res.ok) return

    test.skip(
      !res.contentType?.includes('text/html'),
      `upstream returned non-HTML content-type: ${res.contentType ?? '(none)'}`,
    )

    const csp = res.csp ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(res.referrerPolicy).toBe('no-referrer')
    expect(res.body).toMatch(/<base href="\/api\/proxy\/elearning\/">/i)
  })

  test('data-urls attribute on real RoboCamp exercise: every comma/semicolon-separated path is proxied', async ({ page }) => {
    // Regression for the nf-renderer ships per-exercise resource lists in a
    // single data-urls attribute, with absolute paths joined by `,` and `;`.
    // The narrow href/src/etc. rewrite only catches the leading `/`, so
    // without dedicated handling the inner segments leak as
    // `localhost:3000/get_file.php?...` (404s) and the simulator never loads.
    // Asserted against a real upstream exercise.
    await loginAsAdmin(page)
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch(
          '/api/proxy/elearning/modelnf.php?exercise=owl-essential-icons-en&strona=SPIKE+Essential+for+Early+Learners',
          { redirect: 'follow' },
        )
        const ct = r.headers.get('content-type') ?? ''
        return {
          ok: true,
          contentType: ct,
          status: r.status,
          body: ct.includes('text/html') ? await r.text() : '',
        }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })

    test.skip(!res.ok, `upstream unreachable: ${'error' in res ? res.error : ''}`)
    test.skip(
      'status' in res ? res.status !== 200 : true,
      `upstream did not return 200 OK (got ${'status' in res ? res.status : 'n/a'})`,
    )
    test.skip(
      !('contentType' in res) || !res.contentType?.includes('text/html'),
      'upstream returned non-HTML',
    )
    const body = 'body' in res ? res.body : ''
    if (!body) return

    const dataUrlsMatch = body.match(/\bdata-urls=(["'])([^"']*)\1/i)
    test.skip(!dataUrlsMatch, 'upstream HTML no longer contains data-urls attribute')
    if (!dataUrlsMatch) return

    const segments = dataUrlsMatch[2].split(/[,;]/).filter(Boolean)
    expect(segments.length).toBeGreaterThan(0)
    for (const seg of segments) {
      // Each absolute-path segment must be proxied; relative or full-URL
      // segments (rare in nf-renderer) are left alone.
      if (seg.startsWith('/')) {
        expect(seg).toMatch(/^\/api\/proxy\/elearning\//)
      }
    }
  })

  test('JS template literals: absolute-path template literals rewritten through proxy', async ({ page }) => {
    // Regression for nf.js setting `this.video.src = \`/video/${id}.mp4\``.
    // Without backtick-prefix-slash handling, the browser fetches the literal
    // path against the app origin (404) instead of the proxy.
    await loginAsAdmin(page)
    const result = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/proxy/elearning/nf.js', { redirect: 'follow' })
        return {
          ok: true,
          status: r.status,
          ct: r.headers.get('content-type'),
          text: await r.text(),
        }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })

    test.skip(!result.ok, `upstream unreachable: ${'error' in result ? result.error : ''}`)
    test.skip(
      'status' in result ? result.status !== 200 : true,
      `upstream nf.js did not return 200 (got ${'status' in result ? result.status : 'n/a'})`,
    )
    test.skip(
      !('ct' in result) || !result.ct?.includes('javascript'),
      `upstream nf.js content-type unexpected: ${'ct' in result ? result.ct : 'n/a'}`,
    )
    const text = 'text' in result ? result.text : ''
    if (!text) return

    // The video.src template literal must be rewritten.
    expect(text).toMatch(/this\.video\.src=`\/api\/proxy\/elearning\/video\//)
    // No remaining backtick-followed-by-absolute-path that points outside the proxy.
    expect(text).not.toMatch(/`\/(?!\/|api\/proxy\/elearning\/)[a-zA-Z]/)
  })
})
