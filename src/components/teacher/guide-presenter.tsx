'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ExternalLink, Gamepad2, Maximize2, Minimize2, X } from 'lucide-react'
import { RobocampEmbed } from '@/components/material/robocamp-embed'
import { toProxyUrl } from '@/lib/robocamp-proxy'
import type { StaffGuide } from '@/actions/teacher/materials'

const BAR_BUTTON =
  'inline-flex h-9.5 items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100'

/**
 * Lesson mode: the guide, full screen, and nothing that can change a material.
 *
 * That absence is the whole reason this is a separate surface rather than a
 * bigger panel on the Materijali tab — while the exercise is on the classroom
 * wall there must be no Uredi, Sakrij or Obriši within reach of a stray click.
 *
 * Rendered as a fixed overlay so it covers the teacher chrome without needing
 * its own route group; Esc leaves, exactly as it does in any other full-screen
 * mode a teacher has used.
 */
export function GuidePresenter({
  guides,
  groupLabel,
  backHref,
}: Readonly<{ guides: StaffGuide[]; groupLabel: string; backHref: string }>) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)

  const current = guides[index]

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    router.push(backHref)
  }, [router, backHref])

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled)
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In fullscreen the browser consumes Esc to exit it; this handler then
      // fires on the *second* press, which is the behaviour a presenter wants.
      if (e.key === 'Escape' && !document.fullscreenElement) leave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [leave])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void rootRef.current?.requestFullscreen()
  }

  const proxied = current?.externalUrl ? toProxyUrl(current.externalUrl) : null

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      <div className="flex h-[54px] flex-shrink-0 items-center justify-between gap-5 border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg bg-cyan-500 text-white">
            <Gamepad2 className="h-[19px] w-[19px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-gray-900">
              {current?.title ?? 'Interaktivni vodič'}
            </p>
            <p className="truncate text-xs text-gray-500">
              {groupLabel}
              {current?.moduleTitle ? ` · ${current.moduleTitle}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Only a COMPETITION group routinely has more than one guide live at
              once; a standard module has exactly the one it is paced to. */}
          {guides.length > 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % guides.length)}
              className={BAR_BUTTON}
            >
              <span className="text-[11px] font-semibold text-gray-400">
                {index + 1}/{guides.length}
              </span>
              Sljedeći vodič
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          ) : null}
          {proxied ? (
            <a href={proxied} target="_blank" rel="noopener noreferrer" className={BAR_BUTTON}>
              <ExternalLink className="h-4 w-4" />
              Nova kartica
            </a>
          ) : null}
          {canFullscreen ? (
            <button type="button" onClick={toggleFullscreen} className={BAR_BUTTON}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {isFullscreen ? 'Zatvori' : 'Cijeli ekran'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={leave}
            className="inline-flex h-9.5 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800"
          >
            <X className="h-[15px] w-[15px]" />
            Izađi
            <span className="rounded border border-gray-700 px-1.5 py-px text-[11px] font-medium text-gray-400">
              Esc
            </span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-grow p-4">
        {current?.externalUrl ? (
          <RobocampEmbed url={current.externalUrl} title={current.title} fit="contain" chrome={false} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">Ovaj vodič nema poveznicu koja se može prikazati.</p>
          </div>
        )}
      </div>
    </div>
  )
}
