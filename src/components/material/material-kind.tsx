import { FileText, Gamepad2, Link2, Presentation, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatBytes, type MaterialDisplayKind } from '@/lib/material-display'

/**
 * One vocabulary for "what kind of thing is this", shared by the kids' list and
 * the staff list so both sides read the same at a glance.
 *
 * The tints are deliberately only cyan, yellow and neutral — the brand's two
 * colors plus grey, not a colour per type. Video is the one FILLED tile because
 * it is the only row that plays something when tapped; a presentation carries
 * the yellow accent so it separates from the pile of PDFs it usually sits next
 * to; documents are the most numerous and therefore the quietest.
 */
export const MATERIAL_KIND_LABEL: Record<MaterialDisplayKind, string> = {
  robocamp: 'Interaktivni vodič',
  video: 'Video',
  presentation: 'Prezentacija',
  document: 'Dokument',
  link: 'Poveznica',
}

const MATERIAL_KIND_ICON: Record<MaterialDisplayKind, LucideIcon> = {
  robocamp: Gamepad2,
  video: Video,
  presentation: Presentation,
  document: FileText,
  link: Link2,
}

const MATERIAL_KIND_TILE_CLASS: Record<MaterialDisplayKind, string> = {
  robocamp: 'bg-cyan-600 text-white',
  video: 'bg-cyan-500 text-white',
  presentation: 'bg-yellow-50 text-yellow-700',
  document: 'bg-gray-100 text-gray-600',
  link: 'bg-cyan-50 text-cyan-600',
}

/** Colour of the type caption above a title — matches its tile. */
export const MATERIAL_KIND_LABEL_CLASS: Record<MaterialDisplayKind, string> = {
  robocamp: 'text-cyan-700',
  video: 'text-cyan-700',
  presentation: 'text-yellow-700',
  document: 'text-gray-500',
  link: 'text-cyan-700',
}

export function MaterialKindTile({
  kind,
  className = 'w-10 h-10 rounded-lg',
  iconClassName = 'w-5 h-5',
}: Readonly<{ kind: MaterialDisplayKind; className?: string; iconClassName?: string }>) {
  const Icon = MATERIAL_KIND_ICON[kind]
  return (
    <span
      className={`flex-shrink-0 inline-flex items-center justify-center ${MATERIAL_KIND_TILE_CLASS[kind]} ${className}`}
    >
      <Icon className={iconClassName} />
    </span>
  )
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * The one fact worth printing under a title. Not the scope, and not the upload
 * date — a child deciding whether to tap wants to know how big the download is
 * or where the link goes. Nothing is invented: duration and slide counts are
 * not stored, so they are simply not claimed.
 */
export function materialMetaLabel(item: {
  externalUrl: string | null
  fileSize: number | null
}): string | null {
  if (item.externalUrl) return hostnameOf(item.externalUrl)
  return formatBytes(item.fileSize)
}
