'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { GalleryView } from '@/actions/teacher/gallery'
import { GalleryGrid } from './gallery-grid'
import { GalleryUploadZone } from './gallery-upload-zone'
import { GalleryLightbox } from './gallery-lightbox'

interface Props {
  view: GalleryView
  canManage: boolean
}

export function GalleryTabsAndGrid({ view, canManage }: Readonly<Props>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isCustom = view.group.course.isCustom

  const tabs = useMemo(
    () =>
      isCustom
        ? []
        : view.modules.map((m) => ({ id: m.id, label: m.title })),
    [view.modules, isCustom],
  )

  const initialTab = (() => {
    if (isCustom) return null
    const fromUrl = searchParams.get('tab')
    if (fromUrl && tabs.some((t) => t.id === fromUrl)) return fromUrl
    if (view.activeModuleId) return view.activeModuleId
    return tabs[0]?.id ?? null
  })()

  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    initialTab,
  )
  const [lightboxIndex, setLightboxIndex] = useState(-1)

  useEffect(() => {
    if (isCustom) return
    if (!activeModuleId) return
    const current = searchParams.get('tab')
    if (current === activeModuleId) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', activeModuleId)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [activeModuleId, isCustom, router, searchParams])

  const filteredImages = useMemo(() => {
    if (isCustom) {
      return view.images.filter((img) => img.moduleId === null)
    }
    return view.images.filter((img) => img.moduleId === activeModuleId)
  }, [view.images, activeModuleId, isCustom])

  const countForTab = (moduleId: string) =>
    view.images.filter((img) => img.moduleId === moduleId).length

  const uploadModuleId = isCustom ? null : activeModuleId
  const canUpload =
    canManage && (isCustom || activeModuleId !== null)

  const emptyLabel = canManage
    ? 'Galerija je prazna. Učitajte prvu sliku iznad.'
    : 'Još nema slika u galeriji.'

  return (
    <div className="space-y-4">
      {!isCustom && tabs.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeModuleId
            const count = countForTab(tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveModuleId(tab.id)}
                className={[
                  'px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-cyan-600 text-cyan-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {tab.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {canUpload && (
        <GalleryUploadZone
          scheduledGroupId={view.group.id}
          moduleId={uploadModuleId}
        />
      )}

      <GalleryGrid
        images={filteredImages}
        canManage={canManage}
        onOpen={(idx) => setLightboxIndex(idx)}
        emptyLabel={emptyLabel}
      />

      <GalleryLightbox
        images={filteredImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
      />
    </div>
  )
}
