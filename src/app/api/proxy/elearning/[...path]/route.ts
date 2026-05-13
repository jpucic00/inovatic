import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const ALLOWED_ORIGIN = 'https://elearning.robocamp.eu'
const ALLOWED_ROLES = new Set<UserRole>(['STUDENT', 'TEACHER', 'ADMIN'])
const PROXY_PREFIX = '/api/proxy/elearning'
const MAX_PATH_DEPTH = 20
const BAD_SEGMENT = /[\\\x00]/

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

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { path } = await params
  if (path.length > MAX_PATH_DEPTH) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 })
  }
  for (const seg of path) {
    if (!seg || seg === '.' || seg === '..' || seg.includes('..') || BAD_SEGMENT.test(seg)) {
      return NextResponse.json({ error: 'Bad path' }, { status: 400 })
    }
  }

  const targetPath = path.join('/')
  const query = req.nextUrl.searchParams.toString()
  const queryString = query ? `?${query}` : ''
  const targetUrl = `${ALLOWED_ORIGIN}/${targetPath}${queryString}`

  const parsed = new URL(targetUrl)
  if (parsed.origin !== ALLOWED_ORIGIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const val = req.headers.get(name)
    if (val) headers.set(name, val)
  }
  headers.set('referer', `${ALLOWED_ORIGIN}/`)

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    redirect: 'follow',
    // @ts-expect-error duplex required for streaming request body
    duplex: 'half',
  })

  const responseHeaders = new Headers(upstream.headers)
  for (const h of STRIP_HEADERS) {
    responseHeaders.delete(h)
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  const isHtml = contentType.includes('text/html')
  const isJs = contentType.includes('javascript')
  const isCss = contentType.includes('text/css')
  const isText = isHtml || isJs || isCss

  if (isText) {
    const text = await upstream.text()
    let patched = text

    if (isHtml || isJs) {
      patched = patched
        .replace(
          /\b(href|src|action|formaction|data-src|poster)=(["'])\/(?!\/)/gi,
          `$1=$2${PROXY_PREFIX}/`,
        )
        .replace(
          /\bcontent=(["'])\s*\d+\s*;\s*url=\/(?!\/)/gi,
          `content=$1 0; url=${PROXY_PREFIX}/`,
        )
        .replace(
          /\b(fetch|axios\.(?:get|post|put|delete|patch))\(\s*(["'`])\/(?!\/)/g,
          `$1($2${PROXY_PREFIX}/`,
        )
        // RoboCamp's nf-renderer stores comma/semicolon-separated absolute
        // paths in data-urls (e.g. "/a.php,/b.php;/c.php"). Rewrite each
        // segment inside the attribute value only — keeps the narrow scope.
        .replace(
          /\b(data-urls)=(["'])([^"']*)\2/gi,
          (_, attr, q, val) =>
            `${attr}=${q}${val.replace(/(^|[,;])\/(?!\/)/g, `$1${PROXY_PREFIX}/`)}${q}`,
        )
        // Template-literal absolute paths in JS: `/video/${id}.mp4` →
        // `/api/proxy/elearning/video/${id}.mp4`. nf.js sets video.src this
        // way. Excludes `// (protocol-relative), `${ (interpolation),
        // and `` ` `` (empty literal).
        .replace(/(`)\/(?![/$`])/g, `$1${PROXY_PREFIX}/`)
    }

    if (isCss || isHtml) {
      patched = patched.replace(
        /\burl\(\s*(["']?)\/(?!\/)/g,
        `url($1${PROXY_PREFIX}/`,
      )
    }

    // Inject <base> AFTER attribute rewrites so the rewrite regex doesn't
    // double-prefix the injected URL.
    if (isHtml) {
      patched = patched.replace(
        /<head(\s[^>]*)?>/i,
        (m) => `${m}<base href="${PROXY_PREFIX}/">`,
      )
    }

    responseHeaders.delete('content-length')
    responseHeaders.set('cache-control', 'no-store')
    responseHeaders.delete('etag')
    responseHeaders.delete('last-modified')
    responseHeaders.set('content-security-policy', CSP)
    responseHeaders.set('x-content-type-options', 'nosniff')
    responseHeaders.set('referrer-policy', 'no-referrer')

    return new NextResponse(patched, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  }

  responseHeaders.set('x-content-type-options', 'nosniff')
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export { handler as GET, handler as POST }
