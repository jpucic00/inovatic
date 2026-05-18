import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const ALLOWED_ORIGIN = 'https://elearning.robocamp.eu'
const ALLOWED_ROLES = new Set<UserRole>(['STUDENT', 'TEACHER', 'ADMIN'])
const PROXY_PREFIX = '/api/proxy/elearning'
const MAX_PATH_DEPTH = 20
const BAD_SEGMENT = /\\/
const NUL_BYTE = String.fromCharCode(0)

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

function isInvalidSegment(seg: string): boolean {
  return (
    !seg ||
    seg === '.' ||
    seg === '..' ||
    seg.includes('..') ||
    seg.includes(NUL_BYTE) ||
    BAD_SEGMENT.test(seg)
  )
}

function validatePath(path: string[]): NextResponse | null {
  if (path.length > MAX_PATH_DEPTH) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 })
  }
  for (const seg of path) {
    if (isInvalidSegment(seg)) {
      return NextResponse.json({ error: 'Bad path' }, { status: 400 })
    }
  }
  return null
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

function rewriteHtmlOrJs(text: string): string {
  return text
    .replaceAll(
      /\b(href|src|action|formaction|data-src|poster)=(["'])\/(?!\/)/gi,
      `$1=$2${PROXY_PREFIX}/`,
    )
    .replaceAll(
      /\bcontent=(["'])\s*\d+\s*;\s*url=\/(?!\/)/gi,
      `content=$1 0; url=${PROXY_PREFIX}/`,
    )
    .replaceAll(
      /\b(fetch|axios\.(?:get|post|put|delete|patch))\(\s*(["'`])\/(?!\/)/g,
      `$1($2${PROXY_PREFIX}/`,
    )
    // RoboCamp's nf-renderer stores comma/semicolon-separated absolute
    // paths in data-urls (e.g. "/a.php,/b.php;/c.php"). Rewrite each
    // segment inside the attribute value only — keeps the narrow scope.
    .replaceAll(/\b(data-urls)=(["'])([^"']*)\2/gi, (_, attr, q, val) => {
      const rewritten = val.replaceAll(/(^|[,;])\/(?!\/)/g, `$1${PROXY_PREFIX}/`)
      return `${attr}=${q}${rewritten}${q}`
    })
    // Template-literal absolute paths in JS: `/video/${id}.mp4` →
    // `/api/proxy/elearning/video/${id}.mp4`. nf.js sets video.src this
    // way. Excludes `// (protocol-relative), `${ (interpolation),
    // and `` ` `` (empty literal).
    .replaceAll(/(`)\/(?![/$`])/g, `$1${PROXY_PREFIX}/`)
}

function rewriteCss(text: string): string {
  return text.replaceAll(/\burl\(\s*(["']?)\/(?!\/)/g, `url($1${PROXY_PREFIX}/`)
}

function injectBase(html: string): string {
  // Inject <base> AFTER attribute rewrites so the rewrite regex doesn't
  // double-prefix the injected URL.
  return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<base href="${PROXY_PREFIX}/">`)
}

function applyTextRewrites(text: string, flags: TextFlags): string {
  let patched = text
  if (flags.isHtml || flags.isJs) patched = rewriteHtmlOrJs(patched)
  if (flags.isCss || flags.isHtml) patched = rewriteCss(patched)
  if (flags.isHtml) patched = injectBase(patched)
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
