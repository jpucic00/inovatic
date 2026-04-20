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
    const last = rest[rest.length - 1]
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
