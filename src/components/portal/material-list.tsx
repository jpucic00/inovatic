import Link from 'next/link'
import { FileText, Presentation, Video, Link2 } from 'lucide-react'
import type { GroupMaterialsView, MaterialItem } from '@/actions/student/materials'
import type { MaterialType } from '@prisma/client'
import { isRobocampUrl } from '@/lib/robocamp-proxy'
import { RobocampEmbed } from '@/components/material/robocamp-embed'
import { VideoEmbed } from '@/components/material/video-embed'

function formatBytes(bytes: number | null): string | null {
  if (bytes == null || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TYPE_LABEL: Record<MaterialType, string> = {
  DOCUMENT: 'Dokument',
  PRESENTATION: 'Prezentacija',
  VIDEO: 'Video',
  LINK: 'Poveznica',
}

function TypeIcon({ type, className }: { type: MaterialType; className?: string }) {
  const common = className ?? 'w-6 h-6'
  switch (type) {
    case 'DOCUMENT':
      return <FileText className={common} />
    case 'PRESENTATION':
      return <Presentation className={common} />
    case 'VIDEO':
      return <Video className={common} />
    case 'LINK':
      return <Link2 className={common} />
  }
}

function resolveHref(item: MaterialItem): string | null {
  if (item.externalUrl) return item.externalUrl
  if (item.fileUrl) return `/api/download/${item.id}`
  return null
}

function MaterialTile({ item }: { item: MaterialItem }) {
  const href = resolveHref(item)
  const size = formatBytes(item.fileSize)

  const header = (
    <div className="flex items-start gap-4 p-4 sm:p-5 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition">
      <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-md bg-cyan-50 text-cyan-600">
        <TypeIcon type={item.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900 truncate">{item.title}</h3>
          <span className="text-xs text-gray-500 whitespace-nowrap">{TYPE_LABEL[item.type]}{size ? ` · ${size}` : ''}</span>
        </div>
        {item.description ? (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
        ) : null}
      </div>
    </div>
  )

  if (item.externalUrl && isRobocampUrl(item.externalUrl)) {
    return (
      <div className="space-y-3">
        {header}
        <RobocampEmbed url={item.externalUrl} title={item.title} />
      </div>
    )
  }

  if (item.type === 'VIDEO') {
    const videoContent = item.externalUrl ? (
      <VideoEmbed url={item.externalUrl} title={item.title} />
    ) : item.fileUrl ? (
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: '56.25%' }}>
        <video
          controls
          preload="metadata"
          className="absolute inset-0 w-full h-full"
          src={item.fileUrl}
        />
      </div>
    ) : null

    if (!videoContent) {
      return <div aria-disabled className="opacity-70">{header}</div>
    }

    return (
      <div className="space-y-3">
        {header}
        {videoContent}
      </div>
    )
  }

  if (!href) {
    return <div aria-disabled className="opacity-70">{header}</div>
  }

  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="block">
      {header}
    </Link>
  )
}

function ModuleSection({
  title,
  isActive,
  materials,
}: {
  title: string
  isActive: boolean
  materials: MaterialItem[]
}) {
  if (materials.length === 0) return null

  return (
    <section className="mb-8" data-active-module={isActive || undefined}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {isActive ? (
          <span className="text-xs font-medium text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">Aktivan modul</span>
        ) : null}
      </div>
      <div className="space-y-3">
        {materials.map((m) => (
          <MaterialTile key={m.id} item={m} />
        ))}
      </div>
    </section>
  )
}

export function MaterialList({ view }: { view: GroupMaterialsView }) {
  const hasAnyModuleMaterial = view.moduleSections.some((s) => s.materials.length > 0)
  const hasGroupMaterials = view.groupMaterials.length > 0

  if (!hasAnyModuleMaterial && !hasGroupMaterials) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">Još nema materijala za ovu grupu.</p>
      </div>
    )
  }

  if (view.group.course.isCustom) {
    return (
      <div className="space-y-3">
        {view.groupMaterials.map((m) => (
          <MaterialTile key={m.id} item={m} />
        ))}
      </div>
    )
  }

  const activeFirst = [...view.moduleSections].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return a.sortOrder - b.sortOrder
  })

  return (
    <div>
      {activeFirst.map((section) => (
        <ModuleSection
          key={section.moduleId}
          title={section.title}
          isActive={section.isActive}
          materials={section.materials}
        />
      ))}
      {hasGroupMaterials ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Materijali grupe</h2>
          <div className="space-y-3">
            {view.groupMaterials.map((m) => (
              <MaterialTile key={m.id} item={m} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
