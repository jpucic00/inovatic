import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getGroupDetail } from '@/actions/admin/group'
import { getAssignableTeachers } from '@/actions/admin/teacher'
import { db } from '@/lib/db'
import { ModuleEnrollmentPanel } from '@/components/admin/groups/module-enrollment-panel'
import { GroupTeachersPanel } from '@/components/admin/groups/group-teachers-panel'
import { GroupInfoPanel } from '@/components/admin/groups/group-info-panel'

export const metadata: Metadata = { title: 'Admin – Detalji grupe' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GroupDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [group, allTeachers, courses, locations] = await Promise.all([
    getGroupDetail(id),
    getAssignableTeachers(),
    db.course.findMany({
      orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, isCustom: true },
    }),
    db.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  if (!group) notFound()

  const assignedUserIds = new Set(group.teacherAssignments.map((ta) => ta.user.id))
  const assignableTeachers = allTeachers.filter((t) => !assignedUserIds.has(t.id))

  const enrolledCount = group.enrollments.length

  const groupForEdit = {
    id: group.id,
    courseId: group.courseId,
    locationId: group.locationId,
    name: group.name,
    date: group.date,
    dayOfWeek: group.dayOfWeek,
    startTime: group.startTime,
    endTime: group.endTime,
    schoolYear: group.schoolYear,
    maxStudents: group.maxStudents,
    enrollmentStart: group.enrollmentStart,
    enrollmentEnd: group.enrollmentEnd,
    course: {
      id: group.course.id,
      title: group.course.title,
      level: group.course.level,
      isCustom: group.course.isCustom,
    },
    location: { id: group.location.id, name: group.location.name },
    enrolledCount,
  }

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
        {group.schoolYear && (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border bg-gray-50 text-gray-600 border-gray-200">
            {group.schoolYear}
          </span>
        )}
      </div>

      {/* Group info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <GroupInfoPanel group={groupForEdit} courses={courses} locations={locations} />
      </div>

      {/* Teachers */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <GroupTeachersPanel
          groupId={group.id}
          assignments={group.teacherAssignments}
          assignableTeachers={assignableTeachers}
        />
      </div>

      {/* Module enrollment panel for standard courses */}
      {!group.course.isCustom && group.course.modules.length > 0 ? (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              Polaznici po modulima ({enrolledCount} u grupi)
            </h2>
          </div>
          <ModuleEnrollmentPanel
            modules={group.course.modules.map((mod) => {
              const schedule = mod.schedules[0] ?? null
              return {
                id: mod.id,
                title: mod.title,
                sortOrder: mod.sortOrder,
                scheduleId: schedule?.id ?? null,
                startDate: schedule?.startDate ?? null,
                endDate: schedule?.endDate ?? null,
              }
            })}
            enrollments={group.enrollments}
            maxStudents={group.maxStudents}
          />
        </div>
      ) : (
        /* Flat student list for radionice */
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
                    <Link
                      href={`/admin/ucenici/${enrollment.user.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-cyan-600 transition-colors"
                    >
                      {enrollment.user.firstName} {enrollment.user.lastName}
                    </Link>
                    <p className="text-xs text-gray-500">{enrollment.user.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
