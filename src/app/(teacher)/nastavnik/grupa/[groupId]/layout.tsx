import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTeacherGroupDetail } from '@/actions/teacher/group'
import { GroupTabs } from '@/components/teacher/group-tabs'
import { GroupHeader } from '@/components/shared/group-header'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

interface LayoutProps {
  params: Promise<{ groupId: string }>
  children: React.ReactNode
}

export default async function TeacherGroupLayout({ params, children }: Readonly<LayoutProps>) {
  const { groupId } = await params
  const group = await getTeacherGroupDetail(groupId)
  const schedule = formatGroupSchedule({ dateRange: isRadionica(group.course.kind), dayOfWeek: group.dayOfWeek, startTime: group.startTime, endTime: group.endTime })

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
        <GroupHeader
          courseTitle={group.course.title}
          name={group.name}
          schedule={schedule}
          locationName={group.location.name}
          teacherNames={group.teacherNames}
          schoolYear={group.schoolYear}
        />
      </header>

      <GroupTabs groupId={group.id} />

      {children}
    </div>
  )
}
