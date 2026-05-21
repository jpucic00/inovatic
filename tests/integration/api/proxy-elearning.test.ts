import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/proxy/elearning/[...path]/route'
import { mockSession } from '../setup'
import { createAdmin, createStudent } from '../helpers/factory'

// All 4 remaining tests from tests/phase3/31-proxy-elearning.spec.ts migrated.
// The 5 pure-rewriter tests live at tests/unit/proxy/*.test.ts (Flux ampbgec).

function mockUpstream(response: Response) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(response)
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function callProxy(pathSegments: string[]) {
  const req = new NextRequest(
    `http://localhost/api/proxy/elearning/${pathSegments.join('/')}`,
  )
  return GET(req, { params: Promise.resolve({ path: pathSegments }) })
}

describe('GET /api/proxy/elearning/[...path] — wiring', () => {
  it('unauthenticated → 401 JSON (auth gate fires before upstream)', async () => {
    mockSession(null)
    const res = await callProxy(['anything'])
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('Unauthorized')
  })

  it('logged-in ADMIN passes the role gate', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    mockUpstream(
      new Response('<html><head></head><body>OK</body></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'x-frame-options': 'SAMEORIGIN',
          'set-cookie': 'upstream=1',
        },
      }),
    )
    const res = await callProxy(['anything'])
    expect(res.status).toBe(200)
  })

  it('strips x-frame-options + set-cookie; always sets nosniff', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    mockUpstream(
      new Response('plain body', {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'x-frame-options': 'DENY',
          'set-cookie': 'a=b',
        },
      }),
    )
    const res = await callProxy(['anything'])
    expect(res.headers.get('x-frame-options'), 'x-frame-options stripped').toBeNull()
    expect(res.headers.get('set-cookie'), 'set-cookie stripped').toBeNull()
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('on HTML responses: sets CSP, referrer-policy, injects <base href> via the rewriter chain', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    mockUpstream(
      new Response('<html><head></head><body><a href="/foo">x</a></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    )
    const res = await callProxy(['anything'])
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    const body = await res.text()
    expect(body).toMatch(/<base href="\/api\/proxy\/elearning\/">/i)
    expect(body, 'href="/foo" was rewritten to proxy path').toContain(
      'href="/api/proxy/elearning/foo"',
    )
  })
})

describe('Role gate', () => {
  it('STUDENT user passes (STUDENT is in ALLOWED_ROLES)', async () => {
    // The route allows STUDENT/TEACHER/ADMIN. Verify STUDENT is not 403'd.
    const student = await createStudent()
    mockSession({ id: student.id, role: 'STUDENT', email: student.email })
    mockUpstream(new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }))
    const res = await callProxy(['anything'])
    expect(res.status, 'STUDENT must not be 403\'d').not.toBe(403)
  })
})

describe('Path validation wiring (defence-in-depth)', () => {
  it('backslash in segment → 400', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await callProxy(['foo\\bar'])
    expect(res.status).toBe(400)
  })

  it('".." traversal → 400', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await callProxy(['foo', '..'])
    expect(res.status).toBe(400)
  })

  it('depth > 20 → 400', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN', email: admin.email })
    const res = await callProxy(Array.from({ length: 21 }, (_, i) => `s${i}`))
    expect(res.status).toBe(400)
  })
})
