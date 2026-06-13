import { FileText, Presentation, Video, Link2, Gamepad2 } from 'lucide-react'
import type { MaterialType } from '@prisma/client'

const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  DOCUMENT: 'Dokument',
  PRESENTATION: 'Prezentacija',
  VIDEO: 'Video',
  LINK: 'Poveznica',
  ROBOCAMP: 'RoboCamp',
}

interface Props {
  type: MaterialType
  className?: string
}

function MaterialTypeIcon({ type, className }: Readonly<Props>) {
  const c = className ?? 'w-5 h-5'
  switch (type) {
    case 'DOCUMENT':
      return <FileText className={c} />
    case 'PRESENTATION':
      return <Presentation className={c} />
    case 'VIDEO':
      return <Video className={c} />
    case 'LINK':
      return <Link2 className={c} />
    case 'ROBOCAMP':
      return <Gamepad2 className={c} />
  }
}

export function MaterialTypeBadge({ type }: Readonly<{ type: MaterialType }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-700">
      <MaterialTypeIcon type={type} className="w-3 h-3" />
      {MATERIAL_TYPE_LABEL[type]}
    </span>
  )
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
