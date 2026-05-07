import Link from 'next/link'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { getStudent } from '@/actions/admin/student'
import type { StudentAttendanceEnrollment } from '@/actions/admin/attendance'
import type { AdminActionResult } from '@/lib/action-types'
import {
  StudentCommentsPanel,
  type AdminCommentsPanelSection,
  type AdminCommentsPanelTab,
} from '@/components/admin/students/student-comments-panel'
import type { CommentListItem } from '@/components/shared/comment-list'
import { AttendancePanel } from '@/components/admin/students/attendance-panel'
import { DeleteEnrollmentButton } from '@/components/admin/students/delete-enrollment-button'
import { DeleteStudentDialog } from '@/components/admin/students/delete-student-dialog'
import { AddEnrollmentDialog } from '@/components/admin/students/add-enrollment-dialog'
import { ManageEnrollmentModules } from '@/components/admin/students/manage-enrollment-modules'
import { CopyCredentials } from './copy-credentials'

type StudentWithRelations = NonNullable<Awaited<ReturnType<typeof getStudent>>>

type CreateCommentAction = (input: {
  studentId: string
  groupId: string
  content: string
  type: 'COMMENT' | 'MODULE_REVIEW'
  moduleId?: string
}) => Promise<AdminActionResult>

type DeleteCommentAction = (commentId: string) => Promise<AdminActionResult>

interface Props {
  viewerRole: 'ADMIN' | 'TEACHER'
  student: StudentWithRelations
  attendance: StudentAttendanceEnrollment[]
  commentsPanelTabs: AdminCommentsPanelTab[]
  /** Required for ADMIN viewer (powers AddEnrollmentDialog). */
  courses?: { id: string; title: string }[]
  backHref: string
  backLabel: string
  onCreateComment: CreateCommentAction
  onDeleteComment: DeleteCommentAction
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

export function StudentDetailView({
  viewerRole,
  student,
  attendance,
  commentsPanelTabs,
  courses,
  backHref,
  backLabel,
  onCreateComment,
  onDeleteComment,
}: Readonly<Props>) {
  const isAdmin = viewerRole === 'ADMIN'
  const fullName = `${student.firstName} ${student.lastName}`
  const hasParentInfo =
    !!student.parentName || !!student.parentEmail || !!student.parentPhone
  const courseOptions = courses ?? []

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
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
            value={<span className="font-mono">{student.username ?? '—'}</span>}
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
          {isAdmin && (
            <AddEnrollmentDialog studentId={student.id} courses={courseOptions} />
          )}
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
                      {isAdmin && (
                        <DeleteEnrollmentButton enrollmentId={enrollment.id} />
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <ManageEnrollmentModules
                      studentId={student.id}
                      enrollmentId={enrollment.id}
                      enrolled={enrolledModules}
                      available={availableModules}
                    />
                  )}
                  {!isAdmin && enrolledModules.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Upisani moduli
                      </p>
                      <ul className="text-sm text-gray-700 space-y-0.5">
                        {enrolledModules.map((m) => (
                          <li key={m.id}>• {m.moduleTitle}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Attendance */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Evidencija dolaska</h2>
        <AttendancePanel enrollments={attendance} />
      </div>

      {/* Comments / Notes */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Bilješke i recenzije
        </h2>
        <StudentCommentsPanel
          studentId={student.id}
          tabs={commentsPanelTabs}
          onCreate={onCreateComment}
          onDelete={onDeleteComment}
        />
      </div>

      {/* Danger zone — admin only */}
      {isAdmin && (
        <div className="border border-red-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-red-700 mb-2">Opasna zona</h2>
          <p className="text-sm text-gray-500 mb-4">
            Trajno brisanje računa učenika, svih upisa i bilješki. Ova radnja se ne
            može poništiti.
          </p>
          <DeleteStudentDialog studentId={student.id} studentName={fullName} />
        </div>
      )}
    </div>
  )
}

function groupLabelOf(name: string | null, courseTitle: string): string {
  return name ? `${courseTitle} — ${name}` : courseTitle
}

export function buildCommentsPanelTabs(
  student: StudentWithRelations,
  attendance: StudentAttendanceEnrollment[],
  canDelete: (authorId: string) => boolean,
): AdminCommentsPanelTab[] {
  type SectionMeta = {
    groupId: string
    groupLabel: string
    schoolYear: string
    modules: { id: string; title: string }[]
    currentlyEnrolled: boolean
  }

  const sectionMeta = new Map<string, SectionMeta>()

  for (const e of student.enrollments) {
    const sg = e.scheduledGroup
    sectionMeta.set(sg.id, {
      groupId: sg.id,
      groupLabel: groupLabelOf(sg.name, sg.course.title),
      schoolYear: e.schoolYear,
      modules: (sg.course.modules ?? []).map((m) => ({
        id: m.id,
        title: m.title,
      })),
      currentlyEnrolled: true,
    })
  }

  for (const c of student.studentComments) {
    if (sectionMeta.has(c.group.id)) continue
    sectionMeta.set(c.group.id, {
      groupId: c.group.id,
      groupLabel: groupLabelOf(c.group.name, c.group.course.title),
      schoolYear: c.group.schoolYear,
      modules: [],
      currentlyEnrolled: false,
    })
  }

  const attendanceByGroup = new Map(
    attendance.map((a) => [
      a.groupId,
      { present: a.presentCount, absent: a.absentCount, total: a.rows.length },
    ]),
  )

  const commentsByGroup = new Map<string, CommentListItem[]>()
  for (const c of student.studentComments) {
    const item: CommentListItem = {
      id: c.id,
      content: c.content,
      type: c.type,
      createdAt: c.createdAt,
      authorName: `${c.author.firstName} ${c.author.lastName}`.trim(),
      authorRole: c.author.role,
      moduleTitle: c.module?.title ?? null,
      groupLabel: null,
      canDelete: canDelete(c.author.id),
    }
    const bucket = commentsByGroup.get(c.group.id) ?? []
    bucket.push(item)
    commentsByGroup.set(c.group.id, bucket)
  }

  const byYear = new Map<string, AdminCommentsPanelSection[]>()
  for (const meta of sectionMeta.values()) {
    const section: AdminCommentsPanelSection = {
      groupId: meta.groupId,
      groupLabel: meta.groupLabel,
      schoolYear: meta.schoolYear,
      modules: meta.modules,
      attendance: attendanceByGroup.get(meta.groupId) ?? null,
      comments: commentsByGroup.get(meta.groupId) ?? [],
      currentlyEnrolled: meta.currentlyEnrolled,
    }
    const bucket = byYear.get(meta.schoolYear) ?? []
    bucket.push(section)
    byYear.set(meta.schoolYear, bucket)
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([schoolYear, sections]) => ({
      schoolYear,
      sections: [...sections].sort((a, b) =>
        a.groupLabel.localeCompare(b.groupLabel, 'hr'),
      ),
    }))
}
