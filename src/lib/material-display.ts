/**
 * Pure classification + link resolution for materials.
 *
 * Deliberately separate from `group-materials-view.ts`, which imports Prisma:
 * the kids' material list is a client component (it filters by kind and expands
 * videos in place), so anything it calls at runtime must be free of server
 * imports. Types may still be pulled from the view module with `import type` —
 * those are erased.
 */
import type { MaterialType } from '@prisma/client'
import { isRobocampUrl } from '@/lib/robocamp-proxy'

/** The four display buckets the kids' page separates materials into. */
type MaterialKind = 'robocamp' | 'videos' | 'docs' | 'links'

/**
 * Classifies a material into one of the four kid-facing buckets. RoboCamp is
 * detected by the first-class type OR (as a fallback for any un-backfilled row)
 * a RoboCamp externalUrl.
 */
export function kindOf(item: { type: MaterialType; externalUrl: string | null }): MaterialKind {
  if (item.type === 'ROBOCAMP' || (item.externalUrl && isRobocampUrl(item.externalUrl))) {
    return 'robocamp'
  }
  if (item.type === 'VIDEO') return 'videos'
  if (item.type === 'LINK') return 'links'
  return 'docs' // DOCUMENT, PRESENTATION
}

/**
 * The kind a material is LABELLED as. Finer than {@link kindOf}: that one
 * buckets DOCUMENT and PRESENTATION together because they lay out identically,
 * while a child reading the list needs to know which of the two they are
 * opening. Built on `kindOf` so the RoboCamp rule has exactly one definition.
 */
export type MaterialDisplayKind =
  | 'robocamp'
  | 'video'
  | 'presentation'
  | 'document'
  | 'link'

export function displayKindOf(item: {
  type: MaterialType
  externalUrl: string | null
}): MaterialDisplayKind {
  if (kindOf(item) === 'robocamp') return 'robocamp'
  if (item.type === 'VIDEO') return 'video'
  if (item.type === 'PRESENTATION') return 'presentation'
  if (item.type === 'LINK') return 'link'
  return 'document'
}

/** Reading order of the flat "Dodatni materijali" list, and of its filters. */
export const EXTRA_KIND_ORDER: MaterialDisplayKind[] = [
  'video',
  'presentation',
  'document',
  'link',
]

/** Where a material row points: its own URL, else the authorised download. */
export function resolveHref(row: {
  id: string
  externalUrl: string | null
  fileUrl: string | null
}): string | null {
  if (row.externalUrl) return row.externalUrl
  if (row.fileUrl) return `/api/download/${row.id}`
  return null
}

/** Human file size, or null when there is nothing worth printing. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
