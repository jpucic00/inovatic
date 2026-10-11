/** `network` = the connection dropped; a number = the route answered with that status. */
type PostFileResult<T> = { ok: true; data: T } | { ok: false; status: number | 'network' }

/**
 * POSTs one multipart form to an upload route, reporting upload progress (0..1).
 *
 * XMLHttpRequest rather than fetch because fetch has no upload progress, and a
 * large file with no visible movement reads as a hang. A 2xx reply whose body is
 * not JSON is reported as status 0, which callers word as a generic failure.
 */
export function postFileWithProgress<T>(
  endpoint: string,
  body: FormData,
  onProgress: (fraction: number) => void,
): Promise<PostFileResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ ok: false, status: xhr.status })
        return
      }
      try {
        resolve({ ok: true, data: JSON.parse(xhr.responseText) as T })
      } catch {
        resolve({ ok: false, status: 0 })
      }
    }
    xhr.onerror = () => resolve({ ok: false, status: 'network' })
    xhr.send(body)
  })
}
