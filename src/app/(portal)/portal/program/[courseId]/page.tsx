import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getClassroomGroups } from '@/actions/classroom'
import { GroupCard } from '@/components/shared/group-card'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

export const metadata: Metadata = { title: 'Odabir grupe' }

/**
 * Step two for the shared classroom login: the program's current-year groups
 * in this city. A child's session never gets here — the action bounces it to
 * its own dashboard.
 */
export default async function ClassroomProgramPage({
  params,
}: Readonly<{ params: Promise<{ courseId: string }> }>) {
  const { courseId } = await params
  const { course, groups } = await getClassroomGroups(courseId)

  return (
    <div>
      <Link
        href="/portal"
        className="mb-4 inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Natrag na programe
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">{course?.title ?? 'Program'}</h1>
      <p className="text-sm text-gray-500 mb-6">Odaberite grupu za pregled materijala.</p>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-500">
          Ovaj program trenutno nema grupa u ovoj školskoj godini.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              href={`/portal/grupa/${g.id}`}
              name={g.name}
              schedule={formatGroupSchedule({
                dateRange: course ? isRadionica(course.kind) : false,
                dayOfWeek: g.dayOfWeek,
                startTime: g.startTime,
                endTime: g.endTime,
                dateStart: g.dateStart,
                dateEnd: g.dateEnd,
              })}
              locationName={g.location.name}
              extraRows={
                g.teacherNames.length > 0 ? (
                  <div className="text-sm text-gray-500">{g.teacherNames.join(', ')}</div>
                ) : null
              }
              footer={
                g.activeModule ? (
                  <p className="mt-3 text-xs text-cyan-700">
                    Aktivan modul: <span className="font-medium">{g.activeModule.title}</span>
                  </p>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
