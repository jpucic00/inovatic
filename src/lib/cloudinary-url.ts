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

    // Everything after "upload", minus the delivery instructions: the leading
    // transformation components (the watermark overlay, a thumbnail resize)
    // and any version segment. What remains is the public id itself.
    let rest = parts.slice(uploadIdx + 1)
    while (rest.length > 1 && isTransformSegment(rest[0])) rest = rest.slice(1)
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
    .replaceAll(/[\u0300-\u036F]/g, '')
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
 * or when a sizing transformation is already present (we don't try to merge
 * two of those). A watermark overlay is NOT a reason to bail — see below.
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

    // A watermark overlay may already sit here, and the resize has to go in
    // FRONT of it: Cloudinary applies chained components left to right, so the
    // logo is then layered onto the finished thumbnail at a constant proportion
    // of it instead of being shrunk and cropped along with the photo. Only an
    // existing *sizing* transformation is a reason to bail.
    if (leadingTransforms(parts, uploadIdx).some(isSizingTransform)) return url

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

/* ------------------------------------------------------------------ *
 * Watermark
 * ------------------------------------------------------------------ */

/**
 * Public id of the Inovatic watermark asset, in Cloudinary's overlay notation
 * (folder separator is `:`, not `/`).
 *
 * Named for its ROLE rather than for the artwork it currently holds: swapping
 * the image in Cloudinary under this id re-brands every watermarked URL at
 * once, with no database rewrite. Currently the bright Inovatic lockup
 * (`public/images/logo_white.png`).
 */
const WATERMARK_OVERLAY_ID = 'branding:inovatic-watermark'

/**
 * The delivery transformation that draws the watermark.
 *
 * `w_0.28` + `fl_relative` sizes the logo against whatever the base image is
 * at that point in the chain, so one constant works for a 1920px hero and a
 * 400px thumbnail alike. `o_60` keeps it readable over a photo without
 * dominating it.
 */
export const WATERMARK_TRANSFORM =
  `l_${WATERMARK_OVERLAY_ID},o_60,w_0.28,fl_relative,g_south_east,x_20,y_20`

/** Every watermark segment, whatever its tuning, starts with this. */
const WATERMARK_PREFIX = `l_${WATERMARK_OVERLAY_ID}`

/**
 * Does this path segment look like a Cloudinary transformation component
 * (`c_fill,w_400`, `l_branding:inovatic-watermark,o_60`) rather than a version
 * or a folder? Every component is `<key>_<value>`, comma-separated; folder
 * names in this project never take that shape (`articles/`, `gallery/`,
 * `materials/`, `branding/` — verified against every stored URL, 2026-09-02).
 * That is a naming constraint on upload folders: a first folder spelled like
 * `wp_uploads` would be read as a transformation and dropped from the public
 * id, and `destroyCloudinaryAssets` would then miss the asset.
 */
function isTransformSegment(segment: string): boolean {
  if (!segment || /^v\d+$/.test(segment)) return false
  return segment.split(',').every((part) => /^[a-z]{1,3}_./.test(part))
}

/**
 * Does this component resize or crop the BASE image?
 *
 * An overlay component is excluded even though it carries `w_`/`h_`: inside an
 * `l_…` those size the layer, not the photo underneath. Missing that made the
 * watermark's own `w_0.28` read as a resize, so `cloudinaryThumbUrl` bailed and
 * every grid silently served full-size images.
 */
function isSizingTransform(segment: string): boolean {
  const components = segment.split(',')
  if (components.some((part) => part.startsWith('l_'))) return false
  return components.some((part) => /^[cwh]_/.test(part))
}

/** The transformation components sitting between `upload` and the public id. */
function leadingTransforms(parts: string[], uploadIdx: number): string[] {
  const found: string[] = []
  for (let i = uploadIdx + 1; i < parts.length - 1 && isTransformSegment(parts[i]); i++) {
    found.push(parts[i])
  }
  return found
}

/** Is the watermark already applied to this URL? */
export function hasWatermark(url: string): boolean {
  return url.includes(`/${WATERMARK_PREFIX}`)
}

/**
 * Add the watermark to a Cloudinary image URL by splicing the overlay in
 * directly after `/image/upload/`.
 *
 * The stored asset is never touched — the watermark exists only in the URL,
 * which is what makes it removable later (`stripWatermark`) without
 * re-uploading a single photo. Applied at upload time so the watermarked
 * string is what lands in the database, and every render path picks it up with
 * no call-site change.
 *
 * Images only. Videos are deliberately left alone: overlaying one is a far
 * more expensive transformation and the association does not need it.
 *
 * Idempotent, and a no-op on anything that is not a Cloudinary image upload
 * URL. Note it will NOT re-tune an already-watermarked URL — changing the
 * transformation means `stripWatermark` first, then this.
 */
export function withWatermark(url: string): string {
  if (!url || hasWatermark(url)) return url
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) return url

    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx <= 0 || uploadIdx >= parts.length - 1) return url
    if (parts[uploadIdx - 1] !== 'image') return url

    // Behind any transformation already in the chain: a resize must stay in
    // FRONT of the overlay (the rule cloudinaryThumbUrl enforces), or the logo
    // is drawn on the full photo and then shrunk and cropped along with it.
    const lead = leadingTransforms(parts, uploadIdx).length
    parts.splice(uploadIdx + 1 + lead, 0, WATERMARK_TRANSFORM)
    parsed.pathname = '/' + parts.join('/')
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Remove the watermark overlay from a URL, leaving every other transformation
 * in place. The inverse of `withWatermark`, and what makes the whole approach
 * reversible: the original asset was never modified, so dropping the segment
 * gives the clean image back.
 */
export function stripWatermark(url: string): string {
  if (!url || !hasWatermark(url)) return url
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('res.cloudinary.com')) return url

    const parts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .filter((seg) => !seg.startsWith(WATERMARK_PREFIX))
    parsed.pathname = '/' + parts.join('/')
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Which of `oldUrls` point at a Cloudinary asset that `newUrls` no longer
 * references — i.e. what is safe to destroy after an edit.
 *
 * Compares resolved PUBLIC IDS, not raw URL strings. Two URLs for the same
 * asset differ whenever their delivery transformations differ, and a plain
 * string diff would then read a still-referenced image as "removed" and delete
 * it from Cloudinary. That is not hypothetical: the watermark backfill rewrites
 * stored URLs, so an editor tab opened before it ran would submit the older
 * spelling of every image it still contains.
 */
export function removedAssetUrls(oldUrls: string[], newUrls: string[]): string[] {
  const assetKey = (url: string) => publicIdFromUrl(url) ?? url
  const kept = new Set(newUrls.map(assetKey))
  const removed = new Map<string, string>()
  for (const url of oldUrls) {
    const key = assetKey(url)
    if (!kept.has(key)) removed.set(key, url)
  }
  return Array.from(removed.values())
}
