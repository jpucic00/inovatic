import cloudinary from '@/lib/cloudinary'
import {
  publicIdFromUrl,
  resourceTypeFromUrl,
  type CloudinaryResourceType,
} from '@/lib/cloudinary-url'

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
