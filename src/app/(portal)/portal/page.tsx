import type { Metadata } from 'next'

import { getMyCurrentEnrollments, type StudentEnrollmentSummary } from '@/actions/student/dashboard'
import { getEffectiveMaterialsForStudent } from '@/actions/student/materials'
import { GroupMaterialsScreen } from '@/components/portal/group-materials-screen'
import { GroupCard, groupByCourse } from '@/components/shared/group-card'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

export const metadata: Metadata = {
  title: 'Portal – Moje grupe',
}

export default async function PortalDashboard() {
  const enrollments = await getMyCurrentEnrollments()

  if (enrollments.length === 0) {
    return <EmptyState />
  }

  if (enrollments.length === 1) {
    return <SingleEnrollmentView enrollment={enrollments[0]} />
  }

  return <MultiEnrollmentGrid enrollments={enrollments} />
}

function EmptyState() {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Dobrodošli</h1>
      <p className="text-gray-500">
        Nemate aktivnih upisa. Obratite se administratoru.
      </p>
    </div>
  )
}

async function SingleEnrollmentView({ enrollment }: Readonly<{ enrollment: StudentEnrollmentSummary }>) {
  const view = await getEffectiveMaterialsForStudent(enrollment.group.id)
  return <GroupMaterialsScreen view={view} />
}

function MultiEnrollmentGrid({ enrollments }: Readonly<{ enrollments: StudentEnrollmentSummary[] }>) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Moje grupe</h1>
      <p className="text-sm text-gray-500 mb-6">Odaberite grupu za pregled materijala.</p>
      <div className="space-y-8">
        {groupByCourse(enrollments, (e) => e.group.course).map((section) => (
          <section key={section.courseId}>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.courseTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {section.items.map((e) => (
                <GroupCard
                  key={e.enrollmentId}
                  href={`/portal/grupa/${e.group.id}`}
                  name={e.group.name}
                  schedule={formatGroupSchedule({ dateRange: isRadionica(e.group.course.kind), dayOfWeek: e.group.dayOfWeek, startTime: e.group.startTime, endTime: e.group.endTime })}
                  locationName={e.group.location.name}
                  footer={e.activeModule ? (
                    <p className="mt-3 text-xs text-cyan-700">
                      Aktivan modul: <span className="font-medium">{e.activeModule.title}</span>
                    </p>
                  ) : null}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
