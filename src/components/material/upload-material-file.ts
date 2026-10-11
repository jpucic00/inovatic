import { uploadErrorMessage } from '@/lib/material-file-type'
import { postFileWithProgress } from '@/components/shared/post-file-with-progress'

const CONNECTION_LOST = 'Veza je prekinuta tijekom uploada. Pokušajte ponovno.'

type UploadedMaterialFile = { url: string; bytes: number; mimeType: string }

/**
 * Uploads one file to `/api/upload/materials`, reporting progress. `mimeType` is the
 * classified type (`classifyMaterialFile`): when the browser labelled the file
 * differently (`''` for a .md, say) it is re-wrapped, since the route trusts the
 * declared type and would otherwise refuse it.
 */
export async function uploadMaterialFile(
  file: File,
  mimeType: string,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true; file: UploadedMaterialFile } | { ok: false; error: string }> {
  const body = new FormData()
  body.append('file', file.type === mimeType ? file : new File([file], file.name, { type: mimeType }))

  const res = await postFileWithProgress<UploadedMaterialFile>('/api/upload/materials', body, onProgress)
  if (res.ok) {
    return { ok: true, file: { url: res.data.url, bytes: res.data.bytes, mimeType: res.data.mimeType } }
  }
  if (res.status === 'network') return { ok: false, error: CONNECTION_LOST }
  return { ok: false, error: uploadErrorMessage(res.status) }
}
