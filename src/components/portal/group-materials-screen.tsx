import Link from 'next/link'
import { ArrowLeft, Image as ImageIcon } from 'lucide-react'
import type { GroupMaterialsView } from '@/lib/group-materials-view'
import { formatGroupSchedule } from '@/lib/format'
import { GroupHeader } from '@/components/shared/group-header'
import { MaterialList } from './material-list'

interface Props {
  view: GroupMaterialsView
  backHref?: string
  backLabel?: string
}

export function GroupMaterialsScreen({ view, backHref, backLabel }: Readonly<Props>) {
  const { group } = view
  const schedule = formatGroupSchedule({
    isCustom: group.course.isCustom,
    dayOfWeek: group.dayOfWeek,
    startTime: group.startTime,
    endTime: group.endTime,
  })

  return (
    <div>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel ?? 'Natrag'}
        </Link>
      ) : null}
      <div className="mb-8">
        <GroupHeader
          courseTitle={group.course.title}
          name={group.name}
          schedule={schedule}
          locationName={group.location.name}
          teacherNames={group.teacherNames}
        />
      </div>
      <div className="mb-6">
        <Link
          href={`/portal/grupa/${group.id}/galerija`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-md transition-colors"
        >
          <ImageIcon className="w-4 h-4" />
          Galerija
        </Link>
      </div>
      <MaterialList view={view} />
    </div>
  )
}
