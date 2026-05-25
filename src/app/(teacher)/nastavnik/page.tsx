import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Users } from 'lucide-react'
import { getMyAssignedGroups } from '@/actions/teacher/dashboard'
import { computeSchoolYear } from '@/lib/school-year'

export const metadata: Metadata = {
  title: 'Nastavnik – Moje grupe',
}

type AssignedGroup = Awaited<ReturnType<typeof getMyAssignedGroups>>[number]

function groupByCourse(
  groups: AssignedGroup[]
): Array<{ courseId: string; courseTitle: string; groups: AssignedGroup[] }> {
  const sections = new Map<string, { courseId: string; courseTitle: string; groups: AssignedGroup[] }>()
  for (const g of groups) {
    let section = sections.get(g.course.id)
    if (!section) {
      section = { courseId: g.course.id, courseTitle: g.course.title, groups: [] }
      sections.set(g.course.id, section)
    }
    section.groups.push(g)
  }
  return Array.from(sections.values())
}

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
          {groupByCourse(groups).map((section) => (
            <section key={section.courseId}>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.courseTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.groups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/nastavnik/grupa/${g.id}`}
                    className="block p-5 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition"
                  >
                    {g.name ? (
                      <h3 className="text-lg font-semibold text-gray-900">{g.name}</h3>
                    ) : null}
                    <div className={`${g.name ? 'mt-3 ' : ''}space-y-1 text-sm text-gray-600`}>
                      {g.dayOfWeek || g.startTime ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {[g.dayOfWeek, g.startTime && g.endTime ? `${g.startTime}–${g.endTime}` : g.startTime]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        {g.location.name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" />
                        {g.enrollmentCount} {g.enrollmentCount === 1 ? 'polaznik' : 'polaznika'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
