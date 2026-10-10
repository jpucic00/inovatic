import { uploadErrorMessage } from '@/lib/material-file-type'

type UploadedMaterialFile = { url: string; bytes: number; mimeType: string }

/**
 * Uploads one file to `/api/upload/materials`, reporting progress.
 *
 * XMLHttpRequest rather than fetch because fetch has no upload progress, and a
 * 40 MB video with no visible movement reads as a hang. `mimeType` is the
 * classified type (`classifyMaterialFile`): when the browser labelled the file
 * differently (`''` for a .md, say) it is re-wrapped, since the route trusts the
 * declared type and would otherwise refuse it.
 */
export function uploadMaterialFile(
  file: File,
  mimeType: string,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true; file: UploadedMaterialFile } | { ok: false; error: string }> {
  const body = new FormData()
  body.append('file', file.type === mimeType ? file : new File([file], file.name, { type: mimeType }))

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload/materials')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ ok: false, error: uploadErrorMessage(xhr.status) })
        return
      }
      try {
        const json = JSON.parse(xhr.responseText) as UploadedMaterialFile
        resolve({ ok: true, file: { url: json.url, bytes: json.bytes, mimeType: json.mimeType } })
      } catch {
        resolve({ ok: false, error: uploadErrorMessage(0) })
      }
    }
    xhr.onerror = () => resolve({ ok: false, error: 'Veza je prekinuta tijekom uploada. Pokušajte ponovno.' })
    xhr.send(body)
  })
}
