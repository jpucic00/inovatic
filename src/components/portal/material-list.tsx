import { BookOpen } from 'lucide-react'
import {
  flattenExtraMaterials,
  interactiveGuides,
  type GroupMaterialsView,
} from '@/lib/group-materials-view'
import { InteractiveGuide } from './interactive-guide'
import { ExtraMaterials } from './extra-materials'

/**
 * The Materijali panel: the interactive guide, then everything else.
 *
 * The old per-scope sections ("Za cijeli program", "Materijali grupe", one per
 * module) are gone. Where a material lives is an authoring concern; a child
 * needs to find the thing and know what kind it is, which is what the flat
 * kind-filtered list below gives them. The scope survives on the staff side,
 * where it decides what a teacher may do with a row.
 */
export function MaterialList({ view }: Readonly<{ view: GroupMaterialsView }>) {
  const guides = interactiveGuides(view)
  const extras = flattenExtraMaterials(view)

  if (guides.length === 0 && extras.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-11 text-center">
        <span className="mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
          <BookOpen className="h-7 w-7" />
        </span>
        <p className="mb-1 text-base font-semibold text-gray-900">
          Materijali još nisu objavljeni
        </p>
        <p className="text-sm text-gray-500">
          Mentor ih dodaje kad krene modul. Javit ćemo ti se na satu.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      {guides.map((guide) => (
        <InteractiveGuide
          key={guide.item.id}
          item={guide.item}
          moduleTitle={guide.moduleTitle}
        />
      ))}
      {extras.length > 0 ? <ExtraMaterials items={extras} /> : null}
    </div>
  )
}
