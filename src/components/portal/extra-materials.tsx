'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { VideoEmbed } from '@/components/material/video-embed'
import {
  MATERIAL_KIND_LABEL,
  MATERIAL_KIND_LABEL_CLASS,
  MaterialKindTile,
  materialMetaLabel,
} from '@/components/material/material-kind'
import {
  displayKindOf,
  resolveHref,
  EXTRA_KIND_ORDER,
  type MaterialDisplayKind,
} from '@/lib/material-display'
import type { MaterialItem } from '@/lib/group-materials-view'

/** Plural forms — the chips name a set, the captions name one thing. */
const FILTER_LABEL: Record<MaterialDisplayKind, string> = {
  robocamp: 'Vodiči',
  video: 'Videi',
  presentation: 'Prezentacije',
  document: 'Dokumenti',
  link: 'Poveznice',
}

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
 * Everything that is not the interactive guide, in ONE list.
 *
 * Filtered by KIND, never by where the material came from: a child looking for
 * the worksheet does not know or care whether it was attached to the module,
 * the programme or their own group. The chips are also the answer to "what kind
 * of thing is this" — the question the scope headings never answered.
 */
export function ExtraMaterials({ items }: Readonly<{ items: MaterialItem[] }>) {
  const [filter, setFilter] = useState<MaterialDisplayKind | 'all'>('all')

  const counts = useMemo(() => {
    const map = new Map<MaterialDisplayKind, number>()
    for (const item of items) {
      const kind = displayKindOf(item)
      map.set(kind, (map.get(kind) ?? 0) + 1)
    }
    return map
  }, [items])

  const present = EXTRA_KIND_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0)
  const shown = filter === 'all' ? items : items.filter((i) => displayKindOf(i) === filter)

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Dodatni materijali</h2>
        <span className="text-[13px] text-gray-400">
          {shown.length} od {items.length} materijala
        </span>
      </div>

      {/* One kind present means the chips would only ever say "all of them". */}
      {present.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {(['all', ...present] as const).map((key) => {
            const isActive = key === filter
            const label = key === 'all' ? 'Sve' : FILTER_LABEL[key]
            const count = key === 'all' ? items.length : (counts.get(key) ?? 0)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={isActive}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'border-cyan-600 bg-cyan-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-cyan-300',
                ].join(' ')}
              >
                {label}
                <span className={isActive ? 'text-white/75' : 'text-gray-400'}>{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <MaterialCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
