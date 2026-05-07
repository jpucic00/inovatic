import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const ALLOWED_ORIGIN = 'https://elearning.robocamp.eu'
const STRIP_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
]

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await params
  const targetPath = path.join('/')
  const query = req.nextUrl.searchParams.toString()
  const queryString = query ? `?${query}` : ''
  const targetUrl = `${ALLOWED_ORIGIN}/${targetPath}${queryString}`

  const parsed = new URL(targetUrl)
  if (parsed.origin !== ALLOWED_ORIGIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const headers = new Headers()
  const FORWARD_HEADERS = ['content-type', 'range', 'accept']
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
  const isText =
    contentType.includes('text/html') ||
    contentType.includes('javascript') ||
    contentType.includes('text/css')
  if (isText) {
    const text = await upstream.text()
    const patched = text.replaceAll(
      /(["'`,;])\/(?!\/)/g,
      '$1/api/proxy/elearning/',
    )
    responseHeaders.delete('content-length')
    responseHeaders.set('cache-control', 'no-store')
    responseHeaders.delete('etag')
    responseHeaders.delete('last-modified')
    return new NextResponse(patched, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export { handler as GET, handler as POST }
