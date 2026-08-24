import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStudentGroupShell } from '@/actions/student/group'
import { GroupHeader } from '@/components/shared/group-header'
import { PortalGroupTabs } from '@/components/portal/portal-group-tabs'
import { formatGroupSchedule } from '@/lib/format'
import { isGradable, isRadionica } from '@/lib/program-kind'

interface LayoutProps {
  params: Promise<{ groupId: string }>
  children: React.ReactNode
}

/**
 * One surface for the group: its heading, and the tab strip sitting on the
 * card's bottom edge. Replaces the two pills that used to float above the
 * materials and sent a child to pages with their own "Natrag na materijale"
 * links — three destinations that never looked like one place.
 */
export default async function PortalGroupLayout({ params, children }: Readonly<LayoutProps>) {
  const { groupId } = await params
  const shell = await getStudentGroupShell(groupId)
  const { group, activeModule, kind } = shell

  const schedule = formatGroupSchedule({
    dateRange: isRadionica(kind),
    dayOfWeek: group.dayOfWeek,
    startTime: group.startTime,
    endTime: group.endTime,
  })

  return (
    <div>
      <Link
        href="/portal"
        className="mb-4 inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Natrag na moje grupe
      </Link>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-6 sm:pb-4">
          <div className="min-w-0">
            <GroupHeader
              courseTitle={group.course.title}
              name={group.name}
              schedule={schedule}
              locationName={group.location.name}
              teacherNames={group.teacherNames}
            />
          </div>
          {/* Only STANDARD programs are paced one module at a time; a radionica
              has none and a competition season runs all of them at once. */}
          {activeModule ? (
            <span className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full bg-cyan-50 px-3.5 py-1.5 text-[13px] font-semibold text-cyan-700">
              <span className="h-[7px] w-[7px] rounded-full bg-cyan-500" />
              Aktivan modul · {activeModule.title}
            </span>
          ) : null}
        </div>

        <PortalGroupTabs groupId={group.id} gradable={isGradable(kind)} />
      </section>

      <div className="mt-6">{children}</div>
    </div>
  )
}
