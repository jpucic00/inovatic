'use client'

import { useMemo, useState } from 'react'
import type { getStudent } from '@/actions/admin/student'
import type { StudentAttendanceEnrollment } from '@/actions/admin/attendance'
import type { AdminActionResult } from '@/lib/action-types'
import {
  StudentCommentsPanel,
  type AdminCommentsPanelTab,
} from '@/components/admin/students/student-comments-panel'
import { AttendancePanel } from '@/components/admin/students/attendance-panel'
import { DeleteEnrollmentButton } from '@/components/admin/students/delete-enrollment-button'
import { AddEnrollmentDialog } from '@/components/admin/students/add-enrollment-dialog'
import { ManageEnrollmentModules } from '@/components/admin/students/manage-enrollment-modules'
import { EnrollmentPaymentPanel } from '@/components/admin/students/enrollment-payment-panel'
import { formatDate } from '@/lib/format'

type StudentEnrollments = NonNullable<
  Awaited<ReturnType<typeof getStudent>>
>['enrollments']

type CreateCommentAction = (input: {
  studentId: string
  groupId: string
  content: string
  type: 'COMMENT' | 'MODULE_REVIEW'
  moduleId?: string
}) => Promise<AdminActionResult>

type DeleteCommentAction = (commentId: string) => Promise<AdminActionResult>

interface Props {
  studentId: string
  /** Year the selector opens on — admin: nav-selected cookie year; teacher: computed current year. */
  defaultYear: string
  enrollments: StudentEnrollments
  attendance: StudentAttendanceEnrollment[]
  commentsPanelTabs: AdminCommentsPanelTab[]
  isAdmin: boolean
  /** Required for ADMIN viewer (powers AddEnrollmentDialog). */
  courses?: { id: string; title: string }[]
  /** Cookie-selected year the AddEnrollmentDialog enrolls into (admin only). */
  selectedYear?: string
  onCreateComment: CreateCommentAction
  onDeleteComment: DeleteCommentAction
}

/**
 * Year-scoped block of a student's detail page: ONE selector jointly drives the
 * three year-dependent sections (Upisane grupe / Evidencija dolaska / Bilješke i
 * recenzije). All years' data is already loaded by the page, so switching years
 * filters client-side — no refetch. Year-independent info (credentials, personal
 * data) lives outside this component, in StudentDetailView.
 */
export function StudentYearSections({
  studentId,
  defaultYear,
  enrollments,
  attendance,
  commentsPanelTabs,
  isAdmin,
  courses,
  selectedYear,
  onCreateComment,
  onDeleteComment,
}: Readonly<Props>) {
  const years = useMemo(() => {
    const set = new Set<string>([defaultYear])
    for (const e of enrollments) set.add(e.schoolYear)
    for (const a of attendance) set.add(a.schoolYear)
    for (const t of commentsPanelTabs) set.add(t.schoolYear)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [defaultYear, enrollments, attendance, commentsPanelTabs])

  const [activeYear, setActiveYear] = useState(defaultYear)

  const yearEnrollments = enrollments.filter((e) => e.schoolYear === activeYear)
  const yearAttendance = attendance.filter((a) => a.schoolYear === activeYear)
  const activeTab = commentsPanelTabs.find((t) => t.schoolYear === activeYear) ?? {
    schoolYear: activeYear,
    sections: [],
  }

  return (
    <>
      {/* Year selector — governs all three sections below */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-500">Školska godina:</span>
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {years.map((y) => {
            const isActive = y === activeYear
            return (
              <button
                key={y}
                type="button"
                onClick={() => setActiveYear(y)}
                className={[
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                ].join(' ')}
              >
                {y}
              </button>
            )
          })}
        </div>
      </div>

      {/* Upisane grupe */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Upisane grupe</h2>
          {isAdmin && (
            <AddEnrollmentDialog studentId={studentId} courses={courses ?? []} />
          )}
        </div>
        {isAdmin && selectedYear && (
          <p className="text-xs text-gray-400 mb-3">
            Novi upis ide u školsku godinu {selectedYear}.
          </p>
        )}
        {yearEnrollments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            Nema upisa za školsku godinu {activeYear}.
          </p>
        ) : (
          <div className="space-y-3">
            {yearEnrollments.map((enrollment) => {
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

              const availableModules = (sg.course.modules ?? []).flatMap((mod) => {
                const modSchedule = mod.schedules.find(
                  (s) => s.schoolYear === enrollment.schoolYear,
                )
                if (!modSchedule) return []
                if (enrolledScheduleIds.has(modSchedule.id)) return []
                return [{ moduleScheduleId: modSchedule.id, moduleTitle: mod.title }]
              })

              return (
                <div key={enrollment.id} className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {sg.course.title}
                        {sg.name && <span className="text-gray-500"> — {sg.name}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[schedule, sg.location.name].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Upisan {formatDate(enrollment.createdAt)}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="shrink-0">
                        <DeleteEnrollmentButton enrollmentId={enrollment.id} />
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <ManageEnrollmentModules
                      studentId={studentId}
                      enrollmentId={enrollment.id}
                      enrolled={enrolledModules}
                      available={availableModules}
                    />
                  )}
                  {isAdmin && (
                    <EnrollmentPaymentPanel
                      enrollmentId={enrollment.id}
                      isCustom={sg.course.isCustom}
                      fullYearPaidAt={enrollment.fullYearPaidAt}
                      modules={enrollment.moduleEnrollments.map((me) => ({
                        moduleEnrollmentId: me.id,
                        title: me.moduleSchedule.module.title,
                        paidAt: me.paidAt,
                      }))}
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

      {/* Evidencija dolaska */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Evidencija dolaska</h2>
        <AttendancePanel enrollments={yearAttendance} />
      </div>

      {/* Bilješke i recenzije */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Bilješke i recenzije
        </h2>
        {/* key={activeYear} remounts so the panel re-initializes to the selected year */}
        <StudentCommentsPanel
          key={activeYear}
          studentId={studentId}
          tabs={[activeTab]}
          onCreate={onCreateComment}
          onDelete={onDeleteComment}
        />
      </div>
    </>
  )
}
