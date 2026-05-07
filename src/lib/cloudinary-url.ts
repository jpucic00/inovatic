import cloudinary from '@/lib/cloudinary'

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

/**
 * Best-effort cleanup of Cloudinary assets. Logs and swallows individual
 * failures — the caller should not block on image cleanup.
 */
export async function destroyCloudinaryAssets(urls: string[]): Promise<void> {
  const publicIds = Array.from(
    new Set(urls.map(publicIdFromUrl).filter((id): id is string => id !== null)),
  )
  if (publicIds.length === 0) return

  await Promise.allSettled(
    publicIds.map((publicId) =>
      cloudinary.uploader.destroy(publicId).catch((err: unknown) => {
        console.error(`Cloudinary destroy failed for ${publicId}:`, err)
      }),
    ),
  )
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
 * Cleanup variant that takes Cloudinary public IDs directly — used when we
 * stored the public_id at upload time (galleries do this). Defaults to
 * `image` resource type since gallery uploads are image-only.
 */
export async function destroyCloudinaryAssetsByPublicId(
  publicIds: string[],
): Promise<void> {
  const ids = Array.from(new Set(publicIds.filter((id): id is string => Boolean(id))))
  if (ids.length === 0) return

  await Promise.allSettled(
    ids.map((publicId) =>
      cloudinary.uploader.destroy(publicId).catch((err: unknown) => {
        console.error(`Cloudinary destroy failed for ${publicId}:`, err)
      }),
    ),
  )
}

/**
 * Cleanup variant that accepts resource_type per URL. Materials upload to
 * `raw/upload/` (PDF/DOCX/PPT) and `video/upload/` (MP4/WEBM) in addition to
 * images, and the plain `destroyCloudinaryAssets` wouldn't pass the right
 * resource_type to the destroy call.
 */
export async function destroyCloudinaryMaterialUrls(urls: string[]): Promise<void> {
  const tasks = urls
    .map((url) => {
      const publicId = publicIdFromUrl(url)
      const resourceType = resourceTypeFromUrl(url)
      return publicId && resourceType ? { publicId, resourceType } : null
    })
    .filter((v): v is { publicId: string; resourceType: CloudinaryResourceType } => v !== null)

  if (tasks.length === 0) return

  await Promise.allSettled(
    tasks.map(({ publicId, resourceType }) =>
      cloudinary.uploader
        .destroy(publicId, { resource_type: resourceType })
        .catch((err: unknown) => {
          console.error(`Cloudinary destroy failed for ${resourceType}:${publicId}:`, err)
        }),
    ),
  )
}
