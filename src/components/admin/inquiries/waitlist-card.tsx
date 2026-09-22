import type { ReactNode } from 'react'
import { Hourglass } from 'lucide-react'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { formatDate } from '@/lib/format'
import type { WaitlistGroupView } from '@/lib/waitlist'

interface WaitlistCardProps {
  waitlistedAt: Date
  position: number | null
  note: string | null
  groups: WaitlistGroupView[]
  /** Uredi + Makni buttons (client components), passed in by the page. */
  actions: ReactNode
}

/** The upit's lista čekanja entry, shown under the status timeline while it is on the list. */
export function WaitlistCard({ waitlistedAt, position, note, groups, actions }: Readonly<WaitlistCardProps>) {
  const hasFreeSpot = groups.some((g) => !g.isFull)
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
      <div className="flex items-start gap-3">
        <Hourglass className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-orange-900">Na listi čekanja</h2>
            {hasFreeSpot && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-800 border-emerald-200">
                Slobodno mjesto
              </span>
            )}
          </div>
          <p className="text-sm text-orange-800 mt-1">
            Od {formatDate(waitlistedAt)}
            {position !== null && <> · <strong>{position}.</strong> na listi</>}
          </p>

          {groups.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {groups.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                  <span>
                    {[g.courseTitle, g.name, g.schedule, g.locationName].filter(Boolean).join(' · ')}
                  </span>
                  <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm italic text-orange-700">Nije odabrana nijedna grupa.</p>
          )}

          {note && (
            <p className="mt-3 text-sm text-gray-900 whitespace-pre-wrap">{note}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
        </div>
      </div>
    </div>
  )
}
