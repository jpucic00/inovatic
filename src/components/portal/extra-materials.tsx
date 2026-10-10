'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { VideoEmbed } from '@/components/material/video-embed'
import {
  MATERIAL_KIND_LABEL,
  MATERIAL_KIND_LABEL_CLASS,
  MaterialKindTile,
  materialMetaLabel,
} from '@/components/material/material-kind'
import { displayKindOf, resolveHref, type MaterialDisplayKind } from '@/lib/material-display'
import type { MaterialItem } from '@/lib/group-materials-view'

function CardShell({
  kind,
  title,
  meta,
  description,
}: Readonly<{
  kind: MaterialDisplayKind
  title: string
  meta: string | null
  description: string | null
}>) {
  return (
    <>
      <MaterialKindTile kind={kind} className="h-[42px] w-[42px] rounded-lg" />
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[11px] font-bold uppercase tracking-wider ${MATERIAL_KIND_LABEL_CLASS[kind]}`}
        >
          {MATERIAL_KIND_LABEL[kind]}
        </span>
        <span className="mt-0.5 block text-sm font-semibold leading-snug text-gray-900">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block line-clamp-1 text-xs text-gray-500">{description}</span>
        ) : null}
        {meta ? <span className="mt-1 block text-xs text-gray-400">{meta}</span> : null}
      </span>
    </>
  )
}

const CARD_CLASS =
  'flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-cyan-400 hover:shadow-sm'

/**
 * A video is the one row that plays rather than opens, so it expands in place
 * instead of navigating away — the same behaviour the old kind-grouped list
 * had, kept while the grouping around it changed.
 */
function VideoCard({ item }: Readonly<{ item: MaterialItem }>) {
  const [open, setOpen] = useState(false)
  return (
    <div className={open ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full ${CARD_CLASS} ${open ? 'rounded-b-none border-cyan-400' : ''}`}
      >
        <CardShell
          kind="video"
          title={item.title}
          meta={materialMetaLabel(item)}
          description={item.description}
        />
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="rounded-b-lg border border-t-0 border-cyan-400 bg-white p-4">
          {item.externalUrl ? (
            <VideoEmbed url={item.externalUrl} title={item.title} />
          ) : (
            <div
              className="relative w-full overflow-hidden rounded-lg bg-black"
              style={{ paddingTop: '56.25%' }}
            >
              <video
                controls
                preload="metadata"
                className="absolute inset-0 h-full w-full"
                src={item.fileUrl ?? undefined}
              >
                <track kind="captions" />
              </video>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function MaterialCard({ item }: Readonly<{ item: MaterialItem }>) {
  const kind = displayKindOf(item)
  if (kind === 'video') return <VideoCard item={item} />

  const href = resolveHref(item)
  const shell = (
    <CardShell
      kind={kind}
      title={item.title}
      meta={materialMetaLabel(item)}
      description={item.description}
    />
  )

  if (!href) {
    return (
      <div aria-disabled className={`${CARD_CLASS} opacity-70`}>
        {shell}
      </div>
    )
  }
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className={CARD_CLASS}>
      {shell}
    </Link>
  )
}

/**
 * A lesson's materials other than its interactive guide, as kind-labelled cards
 * in the order the author put them.
 *
 * This used to be ONE flat "Dodatni materijali" list for the whole group, with
 * kind filter chips to make a long pile searchable. The lesson structure took
 * that job over: a lesson holds a handful of things, so the chips would mostly
 * say "all of them", and sorting by kind would undo the order the mentor chose
 * for the lesson. Each card still says what kind of thing it opens.
 */
export function MaterialCards({
  items,
  actionFor,
}: Readonly<{
  items: MaterialItem[]
  /**
   * Staff only: a control shown BESIDE a card (never inside it — the card is a
   * link or a button itself). The portal passes nothing.
   */
  actionFor?: (item: MaterialItem) => ReactNode
}>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const action = actionFor?.(item)
        if (!action) return <MaterialCard key={item.id} item={item} />
        return (
          <div key={item.id} className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <MaterialCard item={item} />
            </div>
            {action}
          </div>
        )
      })}
    </div>
  )
}
