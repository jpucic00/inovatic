/**
 * Pure helpers for the elearning proxy route. Extracted so they can be
 * unit-tested without the Next.js runtime, an HTTP round-trip, or a mocked
 * session. All references to `PROXY_PREFIX` are parameterised as `basePath`.
 */

const MAX_PATH_DEPTH = 20
const BAD_SEGMENT = /\\/
const NUL_BYTE = String.fromCodePoint(0)

export type PathValidationResult =
  | { ok: true }
  | { ok: false; status: 400; reason: 'depth' | 'segment' }

export function validateProxyPath(segments: string[]): PathValidationResult {
  if (segments.length > MAX_PATH_DEPTH) {
    return { ok: false, status: 400, reason: 'depth' }
  }
  for (const seg of segments) {
    if (isInvalidSegment(seg)) {
      return { ok: false, status: 400, reason: 'segment' }
    }
  }
  return { ok: true }
}

function isInvalidSegment(seg: string): boolean {
  if (!seg) return true
  if (seg === '.' || seg === '..') return true
  if (seg.includes('..')) return true
  if (seg.includes(NUL_BYTE)) return true
  if (BAD_SEGMENT.test(seg)) return true
  return false
}

function rewriteHtmlOrJsImpl(text: string, basePath: string): string {
  return text
    .replaceAll(
      /\b(href|src|action|formaction|data-src|poster)=(["'])\/(?!\/)/gi,
      `$1=$2${basePath}/`,
    )
    .replaceAll(
      /\bcontent=(["'])\s*\d+\s*;\s*url=\/(?!\/)/gi,
      `content=$1 0; url=${basePath}/`,
    )
    .replaceAll(
      /\b(fetch|axios\.(?:get|post|put|delete|patch))\(\s*(["'`])\/(?!\/)/g,
      `$1($2${basePath}/`,
    )
    // RoboCamp's nf-renderer stores comma/semicolon-separated absolute
    // paths in data-urls (e.g. "/a.php,/b.php;/c.php"). Rewrite each segment
    // inside the attribute value only — keeps the narrow scope.
    .replaceAll(/\b(data-urls)=(["'])([^"']*)\2/gi, (_, attr, q, val) => {
      const rewritten = val.replaceAll(/(^|[,;])\/(?!\/)/g, `$1${basePath}/`)
      return `${attr}=${q}${rewritten}${q}`
    })
    // Template-literal absolute paths in JS: `/video/${id}.mp4` →
    // `${basePath}/video/${id}.mp4`. nf.js sets video.src this way.
    // Excludes `// (protocol-relative), `${ (interpolation), `` ` `` (empty).
    .replaceAll(/(`)\/(?![/$`])/g, `$1${basePath}/`)
}

/**
 * Rewrite absolute paths in HTML to point through the proxy. Also covers
 * inline `<script>` content (fetch/axios calls, template-literal URLs).
 */
export function rewriteProxyHtml(body: string, basePath: string): string {
  return rewriteHtmlOrJsImpl(body, basePath)
}

/** Rewrite absolute paths in JS (fetch/axios, template-literal URLs). */
export function rewriteProxyJs(body: string, basePath: string): string {
  return rewriteHtmlOrJsImpl(body, basePath)
}

/** Rewrite `url(/foo)` inside CSS to point through the proxy. */
export function rewriteProxyCss(body: string, basePath: string): string {
  return body.replaceAll(/\burl\(\s*(["']?)\/(?!\/)/g, `url($1${basePath}/`)
}

/** Inject a `<base href="...">` tag after the opening `<head>` tag. */
export function injectProxyBase(html: string, basePath: string): string {
  return html.replace(
    /<head(\s[^>]*)?>/i,
    (m) => `${m}<base href="${basePath}/">`,
  )
}
