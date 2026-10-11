import { afterEach, describe, expect, it, vi } from 'vitest'
import { postFileWithProgress } from '@/components/shared/post-file-with-progress'
import { uploadMaterialFile } from '@/components/material/upload-material-file'

// A stand-in XMLHttpRequest: each test drives the one request the helper opens.
class FakeXhr {
  static last: FakeXhr | null = null
  status = 0
  responseText = ''
  method = ''
  url = ''
  body: unknown = null
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  send(body: unknown) {
    this.body = body
  }
  respond(status: number, text: string) {
    this.status = status
    this.responseText = text
    this.onload?.()
  }
}

function current(): FakeXhr {
  if (!FakeXhr.last) throw new Error('no request was opened')
  return FakeXhr.last
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeXhr.last = null
})

describe('postFileWithProgress', () => {
  it('POSTs the form and resolves with the parsed JSON on 2xx', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const body = new FormData()
    const promise = postFileWithProgress<{ url: string }>('/api/upload/gallery', body, () => {})
    expect(current().method).toBe('POST')
    expect(current().url).toBe('/api/upload/gallery')
    expect(current().body).toBe(body)
    current().respond(201, '{"url":"https://x/y.png"}')
    await expect(promise).resolves.toEqual({ ok: true, data: { url: 'https://x/y.png' } })
  })

  it('reports the status of a refused upload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const promise = postFileWithProgress('/api/upload/gallery', new FormData(), () => {})
    current().respond(413, '{"error":"too big"}')
    await expect(promise).resolves.toEqual({ ok: false, status: 413 })
  })

  it('reports a 2xx that is not JSON as status 0', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const promise = postFileWithProgress('/api/upload/gallery', new FormData(), () => {})
    current().respond(200, '<html>proxy page</html>')
    await expect(promise).resolves.toEqual({ ok: false, status: 0 })
  })

  it('reports a dropped connection as network', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const promise = postFileWithProgress('/api/upload/gallery', new FormData(), () => {})
    current().onerror?.()
    await expect(promise).resolves.toEqual({ ok: false, status: 'network' })
  })

  it('reports progress only when the size is known', () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const onProgress = vi.fn()
    void postFileWithProgress('/api/upload/gallery', new FormData(), onProgress)
    current().upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 })
    current().upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.25)
  })
})

describe('uploadMaterialFile', () => {
  it('words a dropped connection differently from a refused file', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })

    const dropped = uploadMaterialFile(file, 'application/pdf', () => {})
    current().onerror?.()
    const droppedResult = await dropped
    expect(droppedResult).toEqual({ ok: false, error: expect.stringMatching(/Veza je prekinuta/) })

    const refused = uploadMaterialFile(file, 'application/pdf', () => {})
    current().respond(413, '{}')
    const refusedResult = await refused
    expect(refusedResult.ok).toBe(false)
    expect(refusedResult).not.toEqual(droppedResult)
  })

  it('re-wraps a file the browser labelled differently, so the route sees the classified type', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const file = new File(['# hi'], 'notes.md', { type: '' })
    const promise = uploadMaterialFile(file, 'text/markdown', () => {})
    const sent = (current().body as FormData).get('file') as File
    expect(sent.type).toBe('text/markdown')
    expect(sent.name).toBe('notes.md')
    current().respond(200, '{"url":"https://x/n.md","bytes":4,"mimeType":"text/markdown"}')
    await expect(promise).resolves.toEqual({
      ok: true,
      file: { url: 'https://x/n.md', bytes: 4, mimeType: 'text/markdown' },
    })
  })
})
