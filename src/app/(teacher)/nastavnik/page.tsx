import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Users } from 'lucide-react'
import { getMyAssignedGroups } from '@/actions/teacher/dashboard'
import { computeSchoolYear } from '@/lib/school-year'

export const metadata: Metadata = {
  title: 'Nastavnik – Moje grupe',
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/nastavnik/grupa/${g.id}`}
              className="block p-5 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition"
            >
              <h2 className="text-lg font-semibold text-gray-900">{g.course.title}</h2>
              {g.name ? <p className="text-sm text-gray-500 mt-0.5">{g.name}</p> : null}
              <div className="mt-3 space-y-1 text-sm text-gray-600">
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
      )}
    </div>
  )
}
