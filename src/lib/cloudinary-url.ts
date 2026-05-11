/**
 * Extract the publicId from a Cloudinary delivery URL.
 * Example:
 *   https://res.cloudinary.com/dgc2tp4f8/image/upload/v1703001234/articles/covers/my-article.jpg
 *   → articles/covers/my-article
 *
 * Returns null if the URL is not a recognizable Cloudinary image URL.
 */
export function publicIdFromUrl(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) return null

    // Path shape: /<cloud>/image/upload/[transformations/][v<version>/]<folder>/<file>.<ext>
    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx === -1 || uploadIdx === parts.length - 1) return null

    // Everything after "upload"; drop any version segment (v1234567890).
    let rest = parts.slice(uploadIdx + 1)
    rest = rest.filter((seg) => !/^v\d+$/.test(seg))
    if (rest.length === 0) return null

    // Strip extension from the final segment.
    const last = rest.at(-1)!
    const dot = last.lastIndexOf('.')
    rest[rest.length - 1] = dot > 0 ? last.slice(0, dot) : last

    return rest.join('/')
  } catch {
    return null
  }
}

/** Recognised Cloudinary resource types for `uploader.destroy`. */
export type CloudinaryResourceType = 'image' | 'raw' | 'video'

/**
 * Infer the resource_type from a Cloudinary delivery URL based on the path
 * segment after the cloud name:
 *   /<cloud>/image/upload/... → image
 *   /<cloud>/raw/upload/...   → raw
 *   /<cloud>/video/upload/... → video
 * Returns null if the URL is not a recognisable Cloudinary URL.
 */
export function resourceTypeFromUrl(url: string): CloudinaryResourceType | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx <= 0) return null
    const kind = parts[uploadIdx - 1]
    if (kind === 'image' || kind === 'raw' || kind === 'video') return kind
    return null
  } catch {
    return null
  }
}

export const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

export function sanitiseFilename(name: string): string {
  return name
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-zA-Z0-9._-]/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/(?:^_|_$)/g, '')
    .slice(0, 120) || 'file'
}

/**
 * Inject a Cloudinary delivery transformation into an /upload/ URL so the
 * CDN serves a resized, auto-format, auto-quality variant instead of the
 * original. Used at thumbnail call sites where we set `unoptimized` on the
 * `<Image>` (bypassing Next.js Image Optimization) — the browser receives
 * the rewritten URL verbatim and Cloudinary's edge does the resize.
 *
 *   cloudinaryThumbUrl(url, 400)          → c_limit, w_400         (preserves aspect)
 *   cloudinaryThumbUrl(url, 400, 400)     → c_fill, g_auto, 400×400 (center-crop)
 *
 * Returns the input unchanged when not a recognisable Cloudinary upload URL
 * or when transformations are already present (we don't try to merge).
 */
export function cloudinaryThumbUrl(
  url: string,
  width: number,
  height?: number,
): string {
  if (!url) return url
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) return url

    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx === -1 || uploadIdx >= parts.length - 1) return url

    // Skip if a transformation segment is already present (segment immediately
    // after `upload` is not a version like `v1234567890`).
    const nextSeg = parts[uploadIdx + 1]
    if (!/^v\d+$/.test(nextSeg)) return url

    const transform =
      height === undefined
        ? `c_limit,f_auto,q_auto,w_${width}`
        : `c_fill,g_auto,f_auto,q_auto,w_${width},h_${height}`

    parts.splice(uploadIdx + 1, 0, transform)
    parsed.pathname = '/' + parts.join('/')
    return parsed.toString()
  } catch {
    return url
  }
}
