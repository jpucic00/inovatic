import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/proxy/elearning/[...path]/route'
import { mockSession } from '../setup'

describe('GET /api/proxy/elearning/[...path] — auth smoke', () => {
  it('unauthenticated request returns 401 JSON', async () => {
    mockSession(null)
    const req = new NextRequest('http://localhost/api/proxy/elearning/anything')
    const res = await GET(req, { params: Promise.resolve({ path: ['anything'] }) })
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('Unauthorized')
  })
})
