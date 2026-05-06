import Link from 'next/link'
import { ArrowLeft, Clock, MapPin, Users } from 'lucide-react'
import { getTeacherGroupDetail } from '@/actions/teacher/group'
import { GroupTabs } from '@/components/teacher/group-tabs'

interface LayoutProps {
  params: Promise<{ groupId: string }>
  children: React.ReactNode
}

export default async function TeacherGroupLayout({ params, children }: Readonly<LayoutProps>) {
  const { groupId } = await params
  const group = await getTeacherGroupDetail(groupId)

  return (
    <div>
      <Link
        href="/nastavnik"
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na moje grupe
      </Link>

      <header className="mb-6">
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
          <span className="text-gray-400">• Školska godina {group.schoolYear}.</span>
        </div>
      </header>

      <GroupTabs groupId={group.id} />

      {children}
    </div>
  )
}
