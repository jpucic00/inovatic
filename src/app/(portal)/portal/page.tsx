import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { getMyCurrentEnrollments, type StudentEnrollmentSummary } from '@/actions/student/dashboard'
import { LoginScreen } from '@/components/auth/login-screen'
import { GroupCard, groupByCourse } from '@/components/shared/group-card'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

export const metadata: Metadata = {
  title: 'Polaznički portal',
  description: 'Prijava u Inovatic portal za učenike i nastavnike.',
  // Private auth entry point — keep it out of search indexes.
  robots: { index: false, follow: false },
}

/**
 * `/portal` is both the sign-in URL and the student dashboard. A guest — and,
 * failing closed, a legacy session without a city claim — gets the login
 * screen rendered in place: every auth guard redirects here, so redirecting
 * onward would loop. Signed-in staff bounce to their own panel, mirroring the
 * login action's role routing.
 */
export default async function PortalPage() {
  const session = await auth()
  if (!session?.user?.city) return <LoginScreen />
  if (session.user.role === 'ADMIN') redirect('/admin')
  if (session.user.role === 'TEACHER') redirect('/nastavnik')
  return <PortalDashboard />
}

async function PortalDashboard() {
  const enrollments = await getMyCurrentEnrollments()

  if (enrollments.length === 0) {
    return <EmptyState />
  }

  // One enrollment still means no extra click — but it has to be the real
  // group route, or that child would get the materials panel with no tab strip
  // and no way through to Galerija or Evaluacija.
  if (enrollments.length === 1) {
    redirect(`/portal/grupa/${enrollments[0].group.id}`)
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
