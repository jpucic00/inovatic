'use client'

import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { RobocampEmbed } from '@/components/material/robocamp-embed'
import { MaterialKindTile } from '@/components/material/material-kind'
import { toProxyUrl } from '@/lib/robocamp-proxy'
import type { MaterialItem } from '@/lib/group-materials-view'

/**
 * The RoboCamp exercise, as the one thing on the page a child is meant to DO.
 *
 * Collapsed by default. The embed renders at the exercise's native 1330px stage
 * scaled to the container, which is ~760px tall on a laptop — inlined open, it
 * pushed every worksheet and link below the fold, which is the failure the flat
 * "Dodatni materijali" list exists to fix. One click opens it in place.
 *
 * On a phone it is not embedded at all: 1330px scaled into ~358px is a 27%
 * render nobody can work in, so the button opens the real thing in a new tab.
 */
export function InteractiveGuide({
  item,
  moduleTitle,
}: Readonly<{ item: MaterialItem; moduleTitle: string | null }>) {
  const [open, setOpen] = useState(false)
  const proxied = item.externalUrl ? toProxyUrl(item.externalUrl) : null

  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4 sm:items-center">
          <MaterialKindTile
            kind="robocamp"
            className="w-12 h-12 rounded-xl sm:w-[60px] sm:h-[60px]"
            iconClassName="w-6 h-6 sm:w-[30px] sm:h-[30px]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
              Interaktivni vodič{moduleTitle ? ` · ${moduleTitle}` : ''}
            </p>
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">{item.title}</h2>
            {item.description ? (
              <p className="mt-1 text-sm text-gray-600">{item.description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2.5 sm:ml-auto">
          {proxied ? (
            <a
              href={proxied}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg border border-cyan-200 px-3.5 py-2 text-sm font-medium text-cyan-700 transition-colors hover:bg-white sm:inline-flex"
            >
              <ExternalLink className="h-4 w-4" />
              Nova kartica
            </a>
          ) : null}
          {/* Desktop: open in place. */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="hidden items-center gap-2 rounded-lg bg-cyan-600 px-4.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 sm:inline-flex"
          >
            {open ? 'Sakrij vodič' : 'Pokreni vodič'}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {/* Phone: the embed is unusable at this width — go to the real thing. */}
          {proxied ? (
            <a
              href={proxied}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 text-[15px] font-semibold text-white sm:hidden"
            >
              Otvori vodič
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      {open && item.externalUrl ? (
        <div className="mt-4 hidden sm:block">
          <RobocampEmbed url={item.externalUrl} title={item.title} />
        </div>
      ) : null}
    </section>
  )
}
