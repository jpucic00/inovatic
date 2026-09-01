import Link from 'next/link'
import { Gamepad2, Presentation } from 'lucide-react'
import { MaterialKindTile } from '@/components/material/material-kind'
import type { StaffGuide } from '@/actions/teacher/materials'

/**
 * The one lesson-time action on the Materijali tab.
 *
 * With no guide it becomes a quiet explanation rather than a disabled button:
 * a radionica or a module nobody has attached a RoboCamp link to has nothing to
 * present, and offering a button that cannot work is worse than saying so.
 */
export function GuideLaunchStrip({
  groupId,
  guides,
}: Readonly<{ groupId: string; guides: StaffGuide[] }>) {
  const first = guides[0]

  if (!first) {
    return (
      <section className="flex items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 sm:gap-4.5 sm:p-5">
        <span className="inline-flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          <Gamepad2 className="h-6.5 w-6.5" />
        </span>
        <div className="min-w-0">
          {/* "Grupa", not "modul": this strip also renders for radionice (no
              modules at all) and competition groups (no single active one). */}
          <h2 className="text-base font-semibold text-gray-700">
            Ova grupa nema interaktivni vodič
          </h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            RoboCamp poveznica dodaje se na stranici programa — modulu ili cijelom programu —
            pa je vide sve grupe kojima pripada.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 sm:flex-row sm:items-center sm:gap-4.5 sm:p-5">
      <MaterialKindTile
        kind="robocamp"
        className="h-[54px] w-[54px] rounded-xl"
        iconClassName="h-6.5 w-6.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
          Interaktivni vodič{first.moduleTitle ? ` · ${first.moduleTitle}` : ''}
        </p>
        <h2 className="text-lg font-bold text-gray-900">{first.title}</h2>
        {guides.length > 1 ? (
          <p className="mt-0.5 text-[13px] text-gray-600">
            + još {guides.length - 1} u prezentaciji
          </p>
        ) : null}
      </div>
      <Link
        href={`/nastavnik/prezentacija/${groupId}`}
        className="inline-flex flex-shrink-0 items-center justify-center gap-2.5 rounded-lg bg-cyan-600 px-5.5 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700"
      >
        <Presentation className="h-[19px] w-[19px]" />
        Prezentiraj interaktivni vodič
      </Link>
    </section>
  )
}
