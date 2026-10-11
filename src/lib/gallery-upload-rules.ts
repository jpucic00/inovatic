/**
 * What `/api/upload/gallery` accepts — shared by the route and the picker, so a
 * staged image is refused on the spot instead of after its upload. Client-safe.
 */
export const GALLERY_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** Matches the Cloudinary free-plan image limit. */
export const GALLERY_MAX_BYTES = 10 * 1024 * 1024

export const GALLERY_ACCEPT = [...GALLERY_IMAGE_TYPES].join(',')

/** Why one image cannot be staged, or null when it can. */
export function galleryFileError(file: { type: string; size: number }): string | null {
  if (!GALLERY_IMAGE_TYPES.has(file.type)) return 'nepodržan format (JPG, PNG, WEBP, GIF)'
  if (file.size > GALLERY_MAX_BYTES) return 'veća od 10 MB'
  return null
}

/** A failed upload, in the words the gallery shows. */
export function galleryUploadErrorMessage(status: number | 'network'): string {
  if (status === 'network') return 'Veza je prekinuta.'
  if (status === 401) return 'Sesija je istekla — prijavite se ponovno.'
  if (status === 413) return 'Slika je prevelika (najviše 10 MB).'
  if (status === 415) return 'Nepodržan format ili sadržaj ne odgovara vrsti.'
  return 'Prijenos nije uspio.'
}
