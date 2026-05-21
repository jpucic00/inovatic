import { describe, expect, it } from 'vitest'
import {
  injectProxyBase,
  rewriteProxyCss,
  rewriteProxyHtml,
  rewriteProxyJs,
} from '@/app/api/proxy/elearning/_helpers'

const PROXY = '/api/proxy/elearning'

describe('rewriteProxyHtml — href/src attribute rewriting', () => {
  it('rewrites href="/foo" to href="/api/proxy/elearning/foo"', () => {
    expect(rewriteProxyHtml('<a href="/login.php">x</a>', PROXY)).toBe(
      `<a href="${PROXY}/login.php">x</a>`,
    )
  })

  it('rewrites src, action, formaction, data-src, poster (single + double quotes)', () => {
    const html = `<img src='/a.png'><form action="/b" formaction="/c"><img data-src="/d.jpg" poster='/e.jpg'>`
    expect(rewriteProxyHtml(html, PROXY)).toBe(
      `<img src='${PROXY}/a.png'><form action="${PROXY}/b" formaction="${PROXY}/c"><img data-src="${PROXY}/d.jpg" poster='${PROXY}/e.jpg'>`,
    )
  })

  it('leaves protocol-relative URLs (// prefix) alone', () => {
    const html = '<img src="//cdn.example.com/x.png">'
    expect(rewriteProxyHtml(html, PROXY)).toBe(html)
  })

  it('leaves absolute URLs (http://, https://) alone', () => {
    const html = '<img src="https://example.com/x.png">'
    expect(rewriteProxyHtml(html, PROXY)).toBe(html)
  })

  it('rewrites meta-refresh `content="N; url=/path"` → 0 timer + proxy path', () => {
    const html = '<meta http-equiv="refresh" content="3; url=/landing">'
    expect(rewriteProxyHtml(html, PROXY)).toBe(
      `<meta http-equiv="refresh" content=" 0; url=${PROXY}/landing">`,
    )
  })
})

describe('rewriteProxyHtml — data-urls attribute (comma+semicolon separated)', () => {
  it('rewrites each absolute path inside data-urls="..." regardless of separator', () => {
    const html = '<div data-urls="/a.php,/b.php;/c.php">x</div>'
    expect(rewriteProxyHtml(html, PROXY)).toBe(
      `<div data-urls="${PROXY}/a.php,${PROXY}/b.php;${PROXY}/c.php">x</div>`,
    )
  })

  it('leaves relative paths inside data-urls alone', () => {
    const html = '<div data-urls="a.php,b.php">x</div>'
    expect(rewriteProxyHtml(html, PROXY)).toBe(html)
  })

  it('handles single-quoted data-urls attribute', () => {
    const html = "<div data-urls='/a.php;/b.php'>x</div>"
    expect(rewriteProxyHtml(html, PROXY)).toBe(
      `<div data-urls='${PROXY}/a.php;${PROXY}/b.php'>x</div>`,
    )
  })
})

describe('rewriteProxyJs — fetch/axios and template-literal rewriting', () => {
  it('rewrites fetch("/api/x") to fetch with proxy prefix', () => {
    expect(rewriteProxyJs("fetch('/api/x')", PROXY)).toBe(`fetch('${PROXY}/api/x')`)
    expect(rewriteProxyJs('fetch("/api/x")', PROXY)).toBe(`fetch("${PROXY}/api/x")`)
  })

  it('rewrites axios.get/post/put/delete/patch calls', () => {
    expect(rewriteProxyJs('axios.get("/x")', PROXY)).toBe(`axios.get("${PROXY}/x")`)
    expect(rewriteProxyJs('axios.post("/x")', PROXY)).toBe(`axios.post("${PROXY}/x")`)
    expect(rewriteProxyJs('axios.delete("/x")', PROXY)).toBe(`axios.delete("${PROXY}/x")`)
  })

  it('rewrites template-literal backtick leading slash: `/video/x` → `/api/proxy/elearning/video/x`', () => {
    expect(rewriteProxyJs('video.src = `/video/123.mp4`', PROXY)).toBe(
      `video.src = \`${PROXY}/video/123.mp4\``,
    )
  })

  it('leaves protocol-relative template-literal (`//cdn/x`) alone', () => {
    expect(rewriteProxyJs('const x = `//cdn/x`', PROXY)).toBe('const x = `//cdn/x`')
  })

  it('leaves template-literal that opens with interpolation (${...}) alone', () => {
    expect(rewriteProxyJs('const x = `${id}/x`', PROXY)).toBe('const x = `${id}/x`')
  })

  it('leaves empty template literals alone (``)', () => {
    expect(rewriteProxyJs('const x = ``', PROXY)).toBe('const x = ``')
  })
})

describe('rewriteProxyCss', () => {
  it('rewrites url(/foo.png) to url(/api/proxy/elearning/foo.png)', () => {
    expect(rewriteProxyCss('background: url(/foo.png);', PROXY)).toBe(
      `background: url(${PROXY}/foo.png);`,
    )
  })

  it('rewrites url("/foo.png") with quotes preserved', () => {
    expect(rewriteProxyCss('background: url("/foo.png");', PROXY)).toBe(
      `background: url("${PROXY}/foo.png");`,
    )
    expect(rewriteProxyCss("background: url('/foo.png');", PROXY)).toBe(
      `background: url('${PROXY}/foo.png');`,
    )
  })

  it('leaves url(//cdn/x.png) (protocol-relative) alone', () => {
    expect(rewriteProxyCss('background: url(//cdn/x.png);', PROXY)).toBe(
      'background: url(//cdn/x.png);',
    )
  })

  it('handles whitespace inside url(...)', () => {
    expect(rewriteProxyCss('background: url(   /x.png);', PROXY)).toBe(
      `background: url(${PROXY}/x.png);`,
    )
  })
})

describe('injectProxyBase', () => {
  it('inserts <base href="..."> immediately after the opening <head>', () => {
    expect(injectProxyBase('<html><head><title>x</title></head>', PROXY)).toBe(
      `<html><head><base href="${PROXY}/"><title>x</title></head>`,
    )
  })

  it('handles <head> with attributes', () => {
    expect(injectProxyBase('<head data-x="y">', PROXY)).toBe(
      `<head data-x="y"><base href="${PROXY}/">`,
    )
  })

  it('only injects once (matches first head tag)', () => {
    const html = '<head></head><head></head>'
    const out = injectProxyBase(html, PROXY)
    expect(out.match(/<base/g)?.length).toBe(1)
  })

  it('leaves HTML without <head> unchanged', () => {
    expect(injectProxyBase('<html><body>x</body></html>', PROXY)).toBe(
      '<html><body>x</body></html>',
    )
  })
})
