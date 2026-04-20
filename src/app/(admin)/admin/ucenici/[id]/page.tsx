import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getStudent } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { DeleteEnrollmentButton } from '@/components/admin/students/delete-enrollment-button'
import { DeleteStudentDialog } from '@/components/admin/students/delete-student-dialog'
import { AddCommentForm } from '@/components/admin/students/add-comment-form'
import { AddEnrollmentDialog } from '@/components/admin/students/add-enrollment-dialog'
import { ManageEnrollmentModules } from '@/components/admin/students/manage-enrollment-modules'
import { CopyCredentials } from './copy-credentials'

export const metadata: Metadata = { title: 'Admin – Učenik' }

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

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString('hr-HR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function StudentDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [student, courses] = await Promise.all([getStudent(id), getCourses()])

  if (!student) notFound()

  const fullName = `${student.firstName} ${student.lastName}`
  const hasParentInfo =
    !!student.parentName || !!student.parentEmail || !!student.parentPhone
  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title }))

  const commentGroups = student.enrollments.map((e) => ({
    id: e.scheduledGroup.id,
    name: e.scheduledGroup.name,
    courseName: e.scheduledGroup.course.title,
  }))

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/ucenici"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag na učenike
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Račun kreiran{' '}
          {student.createdAt.toLocaleDateString('hr-HR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Pristupni podaci</h2>
        <dl>
          <DetailRow
            label="Korisničko ime"
            value={
              <span className="font-mono">{student.username ?? '—'}</span>
            }
          />
          <DetailRow
            label="Lozinka"
            value={
              student.plainPassword ? (
                <span className="font-mono">{student.plainPassword}</span>
              ) : (
                <span className="text-gray-400 italic">Nije dostupna</span>
              )
            }
          />
        </dl>
        {student.username && student.plainPassword && (
          <div className="mt-3">
            <CopyCredentials
              username={student.username}
              password={student.plainPassword}
            />
          </div>
        )}
      </div>

      {/* Child + parent info */}
      {(hasParentInfo || student.dateOfBirth || student.childSchool) && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Podaci</h2>
          <dl>
            {student.dateOfBirth && (
              <DetailRow
                label="Datum rođenja"
                value={formatDate(student.dateOfBirth)}
              />
            )}
            {student.childSchool && (
              <DetailRow label="Škola" value={student.childSchool} />
            )}
            {student.parentName && (
              <DetailRow label="Roditelj" value={student.parentName} />
            )}
            {student.parentEmail && (
              <DetailRow
                label="E-mail roditelja"
                value={
                  <a
                    href={`mailto:${student.parentEmail}`}
                    className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {student.parentEmail}
                  </a>
                }
              />
            )}
            {student.parentPhone && (
              <DetailRow
                label="Telefon roditelja"
                value={
                  <a
                    href={`tel:${student.parentPhone}`}
                    className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {student.parentPhone}
                  </a>
                }
              />
            )}
          </dl>
        </div>
      )}

      {/* Enrollments timeline (newest → oldest) */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Upisane grupe</h2>
          <AddEnrollmentDialog studentId={student.id} courses={courseOptions} />
        </div>
        {student.enrollments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nema upisa.</p>
        ) : (
          <div className="space-y-3">
            {student.enrollments.map((enrollment) => {
              const sg = enrollment.scheduledGroup
              const timeRange = sg.startTime
                ? `${sg.startTime}–${sg.endTime ?? ''}`
                : null
              const schedule = [sg.dayOfWeek, timeRange].filter(Boolean).join(', ')

              const enrolledScheduleIds = new Set(
                enrollment.moduleEnrollments.map((me) => me.moduleSchedule.id),
              )
              const enrolledModules = enrollment.moduleEnrollments.map((me) => ({
                id: me.id,
                moduleTitle: me.moduleSchedule.module.title,
              }))

              const availableModules = (sg.course.modules ?? [])
                .flatMap((mod) => {
                  const modSchedule = mod.schedules.find(
                    (s) => s.schoolYear === enrollment.schoolYear,
                  )
                  if (!modSchedule) return []
                  if (enrolledScheduleIds.has(modSchedule.id)) return []
                  return [{ moduleScheduleId: modSchedule.id, moduleTitle: mod.title }]
                })

              return (
                <div
                  key={enrollment.id}
                  className="p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {sg.course.title}
                        {sg.name && (
                          <span className="text-gray-500"> — {sg.name}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[schedule, sg.location.name].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Upisan {enrollment.createdAt.toLocaleDateString('hr-HR')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-200/60 rounded px-1.5 py-0.5">
                        {enrollment.schoolYear}
                      </span>
                      <DeleteEnrollmentButton enrollmentId={enrollment.id} />
                    </div>
                  </div>

                  <ManageEnrollmentModules
                    studentId={student.id}
                    enrollmentId={enrollment.id}
                    enrolled={enrolledModules}
                    available={availableModules}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Comments / Notes */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Bilješke</h2>

        {commentGroups.length > 0 && (
          <div className="mb-6">
            <AddCommentForm studentId={student.id} groups={commentGroups} />
          </div>
        )}

        {student.studentComments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nema bilješki.</p>
        ) : (
          <div className="space-y-4">
            {student.studentComments.map((comment) => (
              <div
                key={comment.id}
                className="p-4 bg-gray-50 rounded-lg border-l-4 border-cyan-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {comment.author.firstName} {comment.author.lastName}
                    </span>
                    <span
                      className={[
                        'px-2 py-0.5 text-xs rounded-full',
                        comment.type === 'MODULE_REVIEW'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600',
                      ].join(' ')}
                    >
                      {comment.type === 'MODULE_REVIEW' ? 'Ocjena modula' : 'Komentar'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {comment.createdAt.toLocaleDateString('hr-HR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {comment.content}
                </p>
                {comment.group && (
                  <p className="text-xs text-gray-400 mt-2">
                    Grupa: {comment.group.name ?? comment.group.course.title}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="border border-red-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-red-700 mb-2">Opasna zona</h2>
        <p className="text-sm text-gray-500 mb-4">
          Trajno brisanje računa učenika, svih upisa i bilješki. Ova radnja se ne
          može poništiti.
        </p>
        <DeleteStudentDialog studentId={student.id} studentName={fullName} />
      </div>
    </div>
  )
}
