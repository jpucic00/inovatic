import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Users } from 'lucide-react'
import { getEffectiveMaterialsForStudent } from '@/actions/student/materials'
import { MaterialList } from '@/components/portal/material-list'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function GroupMaterialsPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getEffectiveMaterialsForStudent(groupId)
  const { group } = view

  return (
    <div>
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na moje grupe
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{group.course.title}</h1>
        {group.name ? <p className="text-sm text-gray-500 mt-1">{group.name}</p> : null}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
          {group.dayOfWeek || group.startTime ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              {[group.dayOfWeek, group.startTime && group.endTime ? `${group.startTime}–${group.endTime}` : group.startTime]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-gray-400" />
            {group.location.name}
          </span>
          {group.teacherNames.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              {group.teacherNames.join(', ')}
            </span>
          ) : null}
        </div>
      </header>

      <MaterialList view={view} />
    </div>
  )
}
