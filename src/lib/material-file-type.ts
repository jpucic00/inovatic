import type { MaterialType } from '@prisma/client'

/**
 * What a dropped file becomes in the lesson editor (Materijali v2). Pure and
 * client-safe: it runs before the upload so a wrong file is refused with a
 * Croatian sentence instead of the upload route's English 415.
 *
 * The list mirrors `/api/upload/materials` exactly — anything outside it would
 * only be refused there. Images are accepted as DOCUMENT: the route stores them,
 * the download route names them with their extension, and a scanned worksheet
 * or a photo of the finished model is real lesson material. Refusing them would
 * send the admin off to wrap a photo in a PDF.
 */

export const MAX_MATERIAL_FILE_BYTES = 50 * 1024 * 1024

const MIME_TO_TYPE: Record<string, MaterialType> = {
  'application/pdf': 'DOCUMENT',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'text/plain': 'DOCUMENT',
  'text/markdown': 'DOCUMENT',
  'application/vnd.ms-powerpoint': 'PRESENTATION',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PRESENTATION',
  'image/jpeg': 'DOCUMENT',
  'image/png': 'DOCUMENT',
  'image/webp': 'DOCUMENT',
  'image/gif': 'DOCUMENT',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
}

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

/** `accept` attribute for the drop zone's file picker. */
export const MATERIAL_FILE_ACCEPT = [
  ...Object.keys(MIME_TO_TYPE),
  ...Object.keys(EXTENSION_TO_MIME).map((ext) => `.${ext}`),
].join(',')

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function resolveMimeType(file: { name: string; type: string }): string | null {
  if (Object.hasOwn(MIME_TO_TYPE, file.type)) return file.type
  const ext = extensionOf(file.name)
  return Object.hasOwn(EXTENSION_TO_MIME, ext) ? EXTENSION_TO_MIME[ext] : null
}

type MaterialFileClassification =
  | { ok: true; type: MaterialType; mimeType: string }
  | { ok: false; error: string }

/**
 * The declared MIME type wins when it is one the route accepts; otherwise the
 * extension decides. Browsers routinely report `.md` (and sometimes Office
 * files) as `''` or `application/octet-stream`, which the route would refuse —
 * the caller re-labels the File with the returned `mimeType` before uploading.
 */
export function classifyMaterialFile(file: {
  name: string
  type: string
  size: number
}): MaterialFileClassification {
  const mimeType = resolveMimeType(file)
  if (!mimeType) {
    return {
      ok: false,
      error: `„${file.name}" nije podržana vrsta datoteke. Dopušteno: PDF, Word, PowerPoint, tekst, slike i video (MP4, WebM, MOV).`,
    }
  }
  if (file.size > MAX_MATERIAL_FILE_BYTES) {
    return {
      ok: false,
      error: `„${file.name}" je prevelika (najviše 50 MB). Za veći video zalijepite YouTube ili Vimeo poveznicu.`,
    }
  }
  return { ok: true, type: MIME_TO_TYPE[mimeType], mimeType }
}

/**
 * The default title of a dropped file: its name without the extension. A name
 * that would end up shorter than the validators' two characters keeps its
 * extension instead, so the material can always be saved as it arrives.
 */
export function titleFromFileName(name: string): string {
  const trimmed = name.trim()
  const dot = trimmed.lastIndexOf('.')
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed).replace(/\s+/g, ' ').trim()
  const title = base.length >= 2 ? base : trimmed
  return title.slice(0, 200)
}

/** The upload route answers in English; this is what the admin reads instead. */
export function uploadErrorMessage(status: number): string {
  if (status === 401) return 'Sesija je istekla — prijavite se ponovno.'
  if (status === 413) return 'Datoteka je prevelika (najviše 50 MB).'
  if (status === 415) return 'Sadržaj datoteke ne odgovara njezinoj vrsti.'
  return 'Upload nije uspio. Pokušajte ponovno.'
}
