'use client'

import { useMemo, useState } from 'react'
import type { StudentDetail } from '@/lib/student-detail'
import type { StudentAttendanceEnrollment } from '@/lib/student-attendance'
import type { AdminActionResult } from '@/lib/action-types'
import { StudentGradebookSection } from '@/components/shared/student-gradebook-section'
import type {
  AssessmentSaveInput,
  GradebookYearTab,
} from '@/lib/student-assessment-view'
import type { RecommendationOption } from '@/lib/assessment-rubric'
import { AttendancePanel } from '@/components/admin/students/attendance-panel'
import { DeleteEnrollmentButton } from '@/components/admin/students/delete-enrollment-button'
import { AddEnrollmentDialog } from '@/components/admin/students/add-enrollment-dialog'
import { ManageEnrollmentModules } from '@/components/admin/students/manage-enrollment-modules'
import { EnrollmentPaymentPanel } from '@/components/admin/students/enrollment-payment-panel'
import { EnrollmentContractToggle } from '@/components/shared/enrollment-contract-toggle'
import { formatDate } from '@/lib/format'

type StudentEnrollments = StudentDetail['enrollments']

type CreateCommentAction = (input: {
  studentId: string
  groupId: string
  content: string
}) => Promise<AdminActionResult>

type DeleteCommentAction = (commentId: string) => Promise<AdminActionResult>

type SaveAssessmentAction = (
  input: AssessmentSaveInput,
) => Promise<AdminActionResult>

type ClearAssessmentAction = (input: {
  studentId: string
  groupId: string
}) => Promise<AdminActionResult>

type SetContractSignedAction = (
  enrollmentId: string,
  signed: boolean,
) => Promise<AdminActionResult>

interface Props {
  studentId: string
  /** Server-computed UTC month start (ms) — the monthly-fee owed/future boundary. */
  currentMonthStartMs: number
  /** Year the selector opens on — admin: nav-selected cookie year; teacher: computed current year. */
  defaultYear: string
  enrollments: StudentEnrollments
  attendance: StudentAttendanceEnrollment[]
  gradebookTabs: GradebookYearTab[]
  recommendationOptions: RecommendationOption[]
  isAdmin: boolean
  /** Required for ADMIN viewer (powers AddEnrollmentDialog). */
  courses?: { id: string; title: string }[]
  /** Cookie-selected year the AddEnrollmentDialog enrolls into (admin only). */
  selectedYear?: string
  onCreateComment: CreateCommentAction
  onDeleteComment: DeleteCommentAction
  onSaveAssessment: SaveAssessmentAction
  onClearAssessment: ClearAssessmentAction
  /** Admin or teacher variant — unlike the paid marks, both roles may set this. */
  onSetContractSigned: SetContractSignedAction
  /**
   * Group ids whose contract mark this viewer may actually change. `undefined`
   * means unrestricted (an ADMIN). A TEACHER gets only their own groups in the
   * current year — the profile lists every enrollment a child has, including
   * colleagues' groups and settled years, and the server refuses those by
   * throwing, which would take the whole page down rather than show a toast.
   */
  contractEditableGroupIds?: readonly string[]
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
  currentMonthStartMs,
  defaultYear,
  enrollments,
  attendance,
  gradebookTabs,
  recommendationOptions,
  isAdmin,
  courses,
  selectedYear,
  onCreateComment,
  onDeleteComment,
  onSaveAssessment,
  onClearAssessment,
  onSetContractSigned,
  contractEditableGroupIds,
}: Readonly<Props>) {
  const years = useMemo(() => {
    const set = new Set<string>([defaultYear])
    for (const e of enrollments) set.add(e.schoolYear)
    for (const a of attendance) set.add(a.schoolYear)
    for (const t of gradebookTabs) set.add(t.schoolYear)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [defaultYear, enrollments, attendance, gradebookTabs])

  const [activeYear, setActiveYear] = useState(defaultYear)

  const yearEnrollments = enrollments.filter((e) => e.schoolYear === activeYear)
  const yearAttendance = attendance.filter((a) => a.schoolYear === activeYear)
  const activeTab = gradebookTabs.find((t) => t.schoolYear === activeYear) ?? {
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
              // Named in the mark confirmations: a child can hold several
              // enrollments in one year and the modal covers the card clicked.
              const groupLabel = [sg.course.title, sg.name].filter(Boolean).join(' — ')

              const enrolledScheduleIds = new Set(
                enrollment.moduleEnrollments.map((me) => me.moduleSchedule.id),
              )
              const enrolledModules = enrollment.moduleEnrollments.map((me) => ({
                id: me.id,
                moduleTitle: me.moduleSchedule.module.title,
              }))

              const availableModules = (sg.course.modules ?? []).flatMap((mod) => {
                // Schedules are per-city rows — pair by the group's own city
                // so the add-module offer never targets the other city's dates.
                const modSchedule = mod.schedules.find(
                  (s) => s.schoolYear === enrollment.schoolYear && s.city === sg.city,
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
                  {/* Both roles: teachers collect the signed contracts at the
                      group, so this is the one enrollment mark that is not
                      gated on isAdmin. */}
                  <EnrollmentContractToggle
                    enrollmentId={enrollment.id}
                    contractSignedAt={enrollment.contractSignedAt}
                    groupLabel={groupLabel}
                    onSetContractSigned={onSetContractSigned}
                    readOnly={
                      contractEditableGroupIds !== undefined &&
                      !contractEditableGroupIds.includes(sg.id)
                    }
                  />
                  {isAdmin && (
                    <EnrollmentPaymentPanel
                      enrollmentId={enrollment.id}
                      currentMonthStartMs={currentMonthStartMs}
                      kind={sg.course.kind}
                      fullYearPaidAt={enrollment.fullYearPaidAt}
                      modules={enrollment.moduleEnrollments.map((me) => ({
                        moduleEnrollmentId: me.id,
                        title: me.moduleSchedule.module.title,
                        paidAt: me.paidAt,
                      }))}
                      months={enrollment.enrollmentMonths.map((m) => ({
                        enrollmentMonthId: m.id,
                        periodStart: m.periodStart,
                        paidAt: m.paidAt,
                      }))}
                      groupLabel={groupLabel}
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

      {/* Ocjene i bilješke */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Ocjene i bilješke
        </h2>
        {/* key={activeYear} remounts so cards re-initialize to the selected year */}
        <StudentGradebookSection
          key={activeYear}
          studentId={studentId}
          sections={activeTab.sections}
          recommendationOptions={recommendationOptions}
          onSaveAssessment={onSaveAssessment}
          onClearAssessment={onClearAssessment}
          onCreateComment={onCreateComment}
          onDeleteComment={onDeleteComment}
        />
      </div>
    </>
  )
}
