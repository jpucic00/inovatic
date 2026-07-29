import Link from 'next/link'
import { FileText, Presentation, Link2, Gamepad2, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  GroupMaterialsView,
  KindBuckets,
  MaterialItem,
  ModuleMaterialGroup,
} from '@/lib/group-materials-view'
import { bucketsAreEmpty } from '@/lib/group-materials-view'
import { RobocampEmbed } from '@/components/material/robocamp-embed'
import { CompactMediaCard } from './compact-media-card'
import { formatBytes } from '@/components/material/material-type-badge'
import { resolveHref } from '@/components/material/staff-material-list'
import { isRadionica } from '@/lib/program-kind'

// ─── Compact rows for documents + links ──────────────────────────────────────

function MaterialRow({ item, icon: Icon }: Readonly<{ item: MaterialItem; icon: LucideIcon }>) {
  const href = resolveHref(item)
  const size = formatBytes(item.fileSize)

  const inner = (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition">
      <span className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-md bg-cyan-50 text-cyan-600">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900 truncate">{item.title}</span>
        {item.description ? (
          <span className="block text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</span>
        ) : null}
      </span>
      {size ? <span className="text-xs text-gray-400 whitespace-nowrap">{size}</span> : null}
    </div>
  )

  if (!href) return <div aria-disabled className="opacity-70">{inner}</div>
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="block">
      {inner}
    </Link>
  )
}

// ─── Kind-separated blocks for a bucket set ──────────────────────────────────

function KindGroup({
  label,
  icon: Icon,
  children,
}: Readonly<{ label: string; icon: LucideIcon; children: React.ReactNode }>) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </h4>
      {children}
    </div>
  )
}

function KindBlocks({
  buckets,
  skipRobocamp = false,
}: Readonly<{ buckets: KindBuckets; skipRobocamp?: boolean }>) {
  return (
    <div className="space-y-5">
      {!skipRobocamp && buckets.robocamp.length > 0 ? (
        <KindGroup label="Interaktivni vodiči" icon={Gamepad2}>
          <div className="space-y-2">
            {buckets.robocamp.map((m) => (
              <CompactMediaCard key={m.id} item={m} kind="robocamp" />
            ))}
          </div>
        </KindGroup>
      ) : null}
      {buckets.videos.length > 0 ? (
        <KindGroup label="Videi" icon={Video}>
          <div className="grid gap-3 sm:grid-cols-2">
            {buckets.videos.map((m) => (
              <CompactMediaCard key={m.id} item={m} kind="video" />
            ))}
          </div>
        </KindGroup>
      ) : null}
      {buckets.docs.length > 0 ? (
        <KindGroup label="Dokumenti" icon={FileText}>
          <div className="space-y-2">
            {buckets.docs.map((m) => (
              <MaterialRow key={m.id} item={m} icon={m.type === 'PRESENTATION' ? Presentation : FileText} />
            ))}
          </div>
        </KindGroup>
      ) : null}
      {buckets.links.length > 0 ? (
        <KindGroup label="Poveznice" icon={Link2}>
          <div className="space-y-2">
            {buckets.links.map((m) => (
              <MaterialRow key={m.id} item={m} icon={Link2} />
            ))}
          </div>
        </KindGroup>
      ) : null}
    </div>
  )
}

/** Visible item count, treating robocamp as hidden when it's skipped (featured). */
function visibleCount(buckets: KindBuckets, skipRobocamp: boolean): number {
  return (
    buckets.videos.length +
    buckets.docs.length +
    buckets.links.length +
    (skipRobocamp ? 0 : buckets.robocamp.length)
  )
}

// ─── Sections ────────────────────────────────────────────────────────────────

function FeaturedRobocamp({ items }: Readonly<{ items: MaterialItem[] }>) {
  if (items.length === 0) return null
  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-3">
        <Gamepad2 className="w-5 h-5 text-cyan-600" />
        Interaktivni vodiči
      </h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id}>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">{item.title}</h3>
            {item.description ? (
              <p className="text-sm text-gray-600 mb-2">{item.description}</p>
            ) : null}
            {item.externalUrl ? <RobocampEmbed url={item.externalUrl} title={item.title} /> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function Section({
  title,
  isActive,
  buckets,
  skipRobocamp = false,
}: Readonly<{ title: string; isActive?: boolean; buckets: KindBuckets; skipRobocamp?: boolean }>) {
  if (visibleCount(buckets, skipRobocamp) === 0) return null
  return (
    <section data-active-module={isActive || undefined}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {isActive ? (
          <span className="text-xs font-medium text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">
            Aktivan modul
          </span>
        ) : null}
      </div>
      <KindBlocks buckets={buckets} skipRobocamp={skipRobocamp} />
    </section>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function MaterialList({ view }: Readonly<{ view: GroupMaterialsView }>) {
  const flatLayout = isRadionica(view.group.course.kind)

  const hasAny =
    view.featuredRobocamp.length > 0 ||
    view.moduleSections.some((s) => !bucketsAreEmpty(s.buckets)) ||
    !bucketsAreEmpty(view.programMaterials) ||
    !bucketsAreEmpty(view.groupMaterials) ||
    !bucketsAreEmpty(view.radionicaMaterials)

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">Još nema materijala za ovu grupu.</p>
      </div>
    )
  }

  if (flatLayout) {
    return (
      <div className="space-y-8">
        <FeaturedRobocamp items={view.featuredRobocamp} />
        <Section title="Materijali" buckets={view.radionicaMaterials} skipRobocamp />
      </div>
    )
  }

  const activeFirst: ModuleMaterialGroup[] = [...view.moduleSections].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return a.sortOrder - b.sortOrder
  })

  return (
    <div className="space-y-8">
      <FeaturedRobocamp items={view.featuredRobocamp} />
      {activeFirst.map((section) => (
        <Section
          key={section.moduleId}
          title={section.title}
          isActive={section.isActive}
          buckets={section.buckets}
          skipRobocamp={section.isActive}
        />
      ))}
      <Section title="Za cijeli program" buckets={view.programMaterials} />
      <Section title="Materijali grupe" buckets={view.groupMaterials} />
    </div>
  )
}
