'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, ExternalLink } from 'lucide-react'
import { toProxyUrl } from '@/lib/robocamp-proxy'

// RoboCamp's nf-renderer exercises are laid out for a ~1330px-wide desktop
// stage. Cramming that into a narrower iframe forces horizontal AND vertical
// scrollbars inside the frame. Instead we render the iframe at its native
// design size and CSS-scale it down to fit the container width — the whole
// exercise is visible with no inner scrollbars — and offer a fullscreen view
// (and a new-tab fallback) so kids can actually work in it at full size.
const BASE_W = 1330
const BASE_H = 860

export function RobocampEmbed({ url, title }: Readonly<{ url: string; title?: string }>) {
  const proxied = toProxyUrl(url)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fsRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)

  const measure = useCallback(() => {
    const w = wrapRef.current?.clientWidth
    if (w && w > 0) setScale(Math.min(1, w / BASE_W))
  }, [])

  useEffect(() => {
    measure()
    // Re-measure across a couple of frames + a short delay to catch late layout
    // shifts (scrollbar appearing, fonts/images settling) that would otherwise
    // leave the scaled frame slightly narrow until the next resize.
    const raf = requestAnimationFrame(measure)
    const timer = setTimeout(measure, 300)
    const ro = new ResizeObserver(measure)
    const el = wrapRef.current
    if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  useEffect(() => {
    setCanFullscreen(typeof document !== 'undefined' && document.fullscreenEnabled)
    const onChange = () => setIsFullscreen(document.fullscreenElement === fsRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void fsRef.current?.requestFullscreen()
    }
  }

  if (!proxied) return null

  return (
    <div ref={wrapRef} className="w-full">
      <div
        ref={fsRef}
        className="relative overflow-hidden rounded-lg border border-gray-200 bg-white mx-auto"
        style={
          isFullscreen
            ? { width: '100%', height: '100%' }
            : { width: Math.round(BASE_W * scale), height: Math.round(BASE_H * scale) }
        }
      >
        <iframe
          src={proxied}
          title={title ?? 'RoboCamp materijal'}
          className="border-0 bg-white"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          style={
            isFullscreen
              ? { width: '100%', height: '100%' }
              : {
                  width: BASE_W,
                  height: BASE_H,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }
          }
        />

        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          <a
            href={proxied}
            target="_blank"
            rel="noopener noreferrer"
            title="Otvori u novoj kartici"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900/80 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-900 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova kartica</span>
          </a>
          {canFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-600 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? 'Zatvori' : 'Cijeli ekran'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
