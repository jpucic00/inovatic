'use client'

import { useState } from 'react'
import { Play, Gamepad2, ChevronDown } from 'lucide-react'
import { RobocampEmbed } from '@/components/material/robocamp-embed'
import { VideoEmbed } from '@/components/material/video-embed'
import type { MaterialItem } from '@/lib/group-materials-view'

/**
 * A compact, click-to-expand card for heavy media (videos + RoboCamp tutorials).
 * Collapsed by default so links/documents below never get buried under big
 * embeds — the kid taps it open only when they want to watch/play.
 */
export function CompactMediaCard({
  item,
  kind,
}: Readonly<{ item: MaterialItem; kind: 'video' | 'robocamp' }>) {
  const [open, setOpen] = useState(false)
  const Icon = kind === 'robocamp' ? Gamepad2 : Play

  return (
    <div
      className={[
        'rounded-lg border bg-white transition',
        open ? 'border-cyan-400 shadow-sm' : 'border-gray-200 hover:border-cyan-400 hover:shadow-sm',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-md bg-cyan-50 text-cyan-600">
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-gray-900 truncate">{item.title}</span>
          {item.description ? (
            <span className="block text-sm text-gray-600 mt-0.5 line-clamp-1">{item.description}</span>
          ) : (
            <span className="block text-xs text-gray-400 mt-0.5">
              {kind === 'robocamp' ? 'Interaktivni vodič — otvori za vježbanje' : 'Otvori za gledanje'}
            </span>
          )}
        </span>
        <ChevronDown
          className={['w-5 h-5 text-gray-400 shrink-0 transition-transform', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>
      {open ? <div className="px-4 pb-4">{renderMedia(item, kind)}</div> : null}
    </div>
  )
}

function renderMedia(item: MaterialItem, kind: 'video' | 'robocamp') {
  if (kind === 'robocamp') {
    return item.externalUrl ? <RobocampEmbed url={item.externalUrl} title={item.title} /> : null
  }
  if (item.externalUrl) {
    return <VideoEmbed url={item.externalUrl} title={item.title} />
  }
  if (item.fileUrl) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: '56.25%' }}>
        <video controls preload="metadata" className="absolute inset-0 w-full h-full" src={item.fileUrl}>
          <track kind="captions" />
        </video>
      </div>
    )
  }
  return null
}
