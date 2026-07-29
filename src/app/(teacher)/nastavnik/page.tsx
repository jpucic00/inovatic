import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { getMyAssignedGroups } from '@/actions/teacher/dashboard'
import { computeSchoolYear } from '@/lib/school-year'
import { formatGroupSchedule } from '@/lib/format'
import { GroupCard, groupByCourse } from '@/components/shared/group-card'
import { isRadionica } from '@/lib/program-kind'

export const metadata: Metadata = {
  title: 'Nastavnik – Moje grupe',
}

type AssignedGroup = Awaited<ReturnType<typeof getMyAssignedGroups>>[number]

export default async function TeacherDashboard() {
  const groups = await getMyAssignedGroups()
  const schoolYear = computeSchoolYear()

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Moje grupe</h1>
          <p className="text-sm text-gray-500 mt-1">Školska godina {schoolYear}.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-500">Nemate dodijeljenih grupa za ovu školsku godinu.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupByCourse(groups, (g: AssignedGroup) => g.course).map((section) => (
            <section key={section.courseId}>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.courseTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((g) => (
                  <GroupCard
                    key={g.id}
                    href={`/nastavnik/grupa/${g.id}`}
                    name={g.name}
                    schedule={formatGroupSchedule({ dateRange: isRadionica(g.course.kind), dayOfWeek: g.dayOfWeek, startTime: g.startTime, endTime: g.endTime })}
                    locationName={g.location.name}
                    extraRows={
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" />
                        {g.enrollmentCount} {g.enrollmentCount === 1 ? 'polaznik' : 'polaznika'}
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
