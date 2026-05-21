import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import {
  injectProxyBase,
  rewriteProxyCss,
  rewriteProxyHtml,
  rewriteProxyJs,
  validateProxyPath,
} from '../_helpers'

export const runtime = 'nodejs'

const ALLOWED_ORIGIN = 'https://elearning.robocamp.eu'
const ALLOWED_ROLES = new Set<UserRole>(['STUDENT', 'TEACHER', 'ADMIN'])
const PROXY_PREFIX = '/api/proxy/elearning'

const STRIP_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
]

const FORWARD_HEADERS = ['content-type', 'range', 'accept']

const CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

type TextFlags = { isHtml: boolean; isJs: boolean; isCss: boolean }

function authorize(session: Session | null): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

function validatePath(path: string[]): NextResponse | null {
  const result = validateProxyPath(path)
  return result.ok ? null : NextResponse.json({ error: 'Bad path' }, { status: result.status })
}

function buildTargetUrl(req: NextRequest, path: string[]): string | NextResponse {
  const targetPath = path.join('/')
  const query = req.nextUrl.searchParams.toString()
  const queryString = query ? `?${query}` : ''
  const targetUrl = `${ALLOWED_ORIGIN}/${targetPath}${queryString}`
  if (new URL(targetUrl).origin !== ALLOWED_ORIGIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return targetUrl
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const val = req.headers.get(name)
    if (val) headers.set(name, val)
  }
  headers.set('referer', `${ALLOWED_ORIGIN}/`)
  return headers
}

function applyTextRewrites(text: string, flags: TextFlags): string {
  let patched = text
  if (flags.isHtml) patched = rewriteProxyHtml(patched, PROXY_PREFIX)
  else if (flags.isJs) patched = rewriteProxyJs(patched, PROXY_PREFIX)
  if (flags.isCss || flags.isHtml) patched = rewriteProxyCss(patched, PROXY_PREFIX)
  if (flags.isHtml) patched = injectProxyBase(patched, PROXY_PREFIX)
  return patched
}

function stripUpstreamHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers)
  for (const h of STRIP_HEADERS) {
    headers.delete(h)
  }
  return headers
}

function buildTextResponseHeaders(upstream: Response): Headers {
  const headers = stripUpstreamHeaders(upstream)
  headers.delete('content-length')
  headers.set('cache-control', 'no-store')
  headers.delete('etag')
  headers.delete('last-modified')
  headers.set('content-security-policy', CSP)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  return headers
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const authError = authorize(await auth())
  if (authError) return authError

  const { path } = await params
  const pathError = validatePath(path)
  if (pathError) return pathError

  const targetUrl = buildTargetUrl(req, path)
  if (typeof targetUrl !== 'string') return targetUrl

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: buildForwardHeaders(req),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    redirect: 'follow',
    // @ts-expect-error duplex required for streaming request body
    duplex: 'half',
  })

  const contentType = upstream.headers.get('content-type') ?? ''
  const flags: TextFlags = {
    isHtml: contentType.includes('text/html'),
    isJs: contentType.includes('javascript'),
    isCss: contentType.includes('text/css'),
  }

  if (flags.isHtml || flags.isJs || flags.isCss) {
    const patched = applyTextRewrites(await upstream.text(), flags)
    return new NextResponse(patched, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildTextResponseHeaders(upstream),
    })
  }

  const headers = stripUpstreamHeaders(upstream)
  headers.set('x-content-type-options', 'nosniff')
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

export { handler as GET, handler as POST }
