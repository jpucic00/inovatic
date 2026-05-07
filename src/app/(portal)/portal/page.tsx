import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Users, Image as ImageIcon } from 'lucide-react'
import { getMyCurrentEnrollments, type StudentEnrollmentSummary } from '@/actions/student/dashboard'
import { getEffectiveMaterialsForStudent } from '@/actions/student/materials'
import { MaterialList } from '@/components/portal/material-list'

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
  const { group } = view

  return (
    <div>
      <div className="mb-8">
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
      </div>
      <div className="mb-6">
        <Link
          href={`/portal/grupa/${group.id}/galerija`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-md transition-colors"
        >
          <ImageIcon className="w-4 h-4" />
          Galerija
        </Link>
      </div>
      <MaterialList view={view} />
    </div>
  )
}

function MultiEnrollmentGrid({ enrollments }: Readonly<{ enrollments: StudentEnrollmentSummary[] }>) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Moje grupe</h1>
      <p className="text-sm text-gray-500 mb-6">Odaberite grupu za pregled materijala.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {enrollments.map((e) => (
          <Link
            key={e.enrollmentId}
            href={`/portal/grupa/${e.group.id}`}
            className="block p-5 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition"
          >
            <h2 className="text-lg font-semibold text-gray-900">{e.group.course.title}</h2>
            {e.group.name ? <p className="text-sm text-gray-500 mt-1">{e.group.name}</p> : null}
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              {e.group.dayOfWeek || e.group.startTime ? (
                <div className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {[e.group.dayOfWeek, e.group.startTime && e.group.endTime ? `${e.group.startTime}–${e.group.endTime}` : e.group.startTime]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              ) : null}
              <div className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                {e.group.location.name}
              </div>
            </div>
            {e.activeModule ? (
              <p className="mt-3 text-xs text-cyan-700">
                Aktivan modul: <span className="font-medium">{e.activeModule.title}</span>
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
