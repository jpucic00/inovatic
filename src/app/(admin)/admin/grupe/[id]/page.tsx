import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users, MapPin, Clock, Calendar } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getGroupDetail } from '@/actions/admin/group'

export const metadata: Metadata = { title: 'Admin – Detalji grupe' }

interface PageProps {
  params: Promise<{ id: string }>
}

function DetailRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  )
}

function enrollmentWindowStatus(
  start: Date | null,
  end: Date | null,
): { label: string; color: string } {
  if (!start && !end) return { label: 'Uvijek otvoreno', color: 'text-green-600' }
  const now = new Date()
  if (end && end < now) return { label: 'Zatvoreno', color: 'text-gray-500' }
  if (start && start > now)
    return {
      label: `Otvara se ${start.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      color: 'text-amber-600',
    }
  return { label: 'Otvoreno', color: 'text-green-600' }
}

function getCapacityColor(pct: number): string {
  if (pct >= 1) return 'text-red-600'
  if (pct >= 0.75) return 'text-amber-600'
  return 'text-green-600'
}

export default async function GroupDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const group = await getGroupDetail(id)

  if (!group) notFound()

  const windowStatus = enrollmentWindowStatus(group.enrollmentStart, group.enrollmentEnd)
  const enrolledCount = group.enrollments.length
  const availableSpots = group.maxStudents - enrolledCount
  const pct = group.maxStudents > 0 ? enrolledCount / group.maxStudents : 0
  const capacityColor = getCapacityColor(pct)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/grupe"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag na grupe
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {group.course.title}
            {group.name && <span className="text-gray-400 font-normal"> – {group.name}</span>}
          </h1>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {group.location.name}
          </p>
        </div>
        <span
          className={[
            'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border',
            group.isActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200',
          ].join(' ')}
        >
          {group.isActive ? 'Aktivna' : 'Neaktivna'}
        </span>
      </div>

      {/* Group info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Informacije o grupi</h2>
        <dl>
          <DetailRow
            label="Program"
            value={
              <span>
                {group.course.title}
                {group.course.level && (
                  <span className="text-gray-400 ml-1">({group.course.level})</span>
                )}
              </span>
            }
          />
          <DetailRow label="Lokacija" value={group.location.name} />
          <DetailRow
            label="Termin"
            value={
              group.dayOfWeek ? (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {group.dayOfWeek}
                  {group.startTime && (
                    <span className="flex items-center gap-1 ml-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {group.startTime}
                      {group.endTime && `–${group.endTime}`}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400 italic">Nije određen</span>
              )
            }
          />
          {group.schoolYear && (
            <DetailRow label="Školska godina" value={group.schoolYear} />
          )}
          <DetailRow
            label="Kapacitet"
            value={
              <span className={capacityColor}>
                {enrolledCount}/{group.maxStudents} polaznika
                {availableSpots > 0 && (
                  <span className="text-gray-400 font-normal"> ({availableSpots} slobodnih)</span>
                )}
              </span>
            }
          />
          <DetailRow
            label="Prozor upisa"
            value={
              <div>
                <span className={windowStatus.color}>{windowStatus.label}</span>
                {(group.enrollmentStart || group.enrollmentEnd) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {group.enrollmentStart &&
                      `Od: ${group.enrollmentStart.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                    {group.enrollmentStart && group.enrollmentEnd && ' – '}
                    {group.enrollmentEnd &&
                      `Do: ${group.enrollmentEnd.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                  </p>
                )}
              </div>
            }
          />
        </dl>
      </div>

      {/* Teachers */}
      {group.teacherAssignments.length > 0 && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Nastavnici</h2>
          <div className="space-y-2">
            {group.teacherAssignments.map((ta) => (
              <div key={ta.id} className="flex items-center gap-2 text-sm text-gray-700">
                <Users className="w-4 h-4 text-gray-400" />
                {ta.user.firstName} {ta.user.lastName}
                <span className="text-gray-400 text-xs">{ta.user.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enrolled students */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Polaznici ({enrolledCount})
          </h2>
        </div>
        {group.enrollments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nema upisanih polaznika.</p>
        ) : (
          <div className="divide-y">
            {group.enrollments.map((enrollment) => (
              <div key={enrollment.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {enrollment.user.firstName} {enrollment.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{enrollment.user.email}</p>
                </div>
                <span
                  className={[
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    enrollment.status === 'ACTIVE'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500',
                  ].join(' ')}
                >
                  {enrollment.status === 'ACTIVE' ? 'Aktivan' : enrollment.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
