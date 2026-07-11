import Link from 'next/link'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { StudentDetail } from '@/lib/student-detail'
import type { StudentAttendanceEnrollment } from '@/lib/student-attendance'
import type { AdminActionResult } from '@/lib/action-types'
import type {
  AssessmentSaveInput,
  GradebookYearTab,
} from '@/lib/student-assessment-view'
import type { RecommendationOption } from '@/lib/assessment-rubric'
import { DeleteStudentDialog } from '@/components/admin/students/delete-student-dialog'
import { StudentYearSections } from '@/components/shared/student-year-sections'
import { CopyButton } from './copy-button'
import { formatDate, formatDateKey } from '@/lib/format'

type StudentWithRelations = StudentDetail

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

interface Props {
  viewerRole: 'ADMIN' | 'TEACHER'
  student: StudentWithRelations
  attendance: StudentAttendanceEnrollment[]
  gradebookTabs: GradebookYearTab[]
  recommendationOptions: RecommendationOption[]
  /** Required for ADMIN viewer (powers AddEnrollmentDialog). */
  courses?: { id: string; title: string }[]
  /** Year the page-level selector opens on — admin: cookie year; teacher: computed current year. */
  defaultYear: string
  /** Cookie-selected year the AddEnrollmentDialog enrolls into (admin only). */
  selectedYear?: string
  backHref: string
  backLabel: string
  onCreateComment: CreateCommentAction
  onDeleteComment: DeleteCommentAction
  onSaveAssessment: SaveAssessmentAction
  onClearAssessment: ClearAssessmentAction
}

function DetailRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  )
}

export function StudentDetailView({
  viewerRole,
  student,
  attendance,
  gradebookTabs,
  recommendationOptions,
  courses,
  defaultYear,
  selectedYear,
  backHref,
  backLabel,
  onCreateComment,
  onDeleteComment,
  onSaveAssessment,
  onClearAssessment,
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
          Račun kreiran {formatDate(student.createdAt)}
        </p>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Pristupni podaci</h2>
        <dl>
          <DetailRow
            label="Korisničko ime"
            value={
              student.username ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono">{student.username}</span>
                  <CopyButton value={student.username} label="korisničko ime" />
                </div>
              ) : (
                <span className="font-mono">—</span>
              )
            }
          />
          <DetailRow
            label="Lozinka"
            value={
              student.plainPassword ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono">{student.plainPassword}</span>
                  <CopyButton value={student.plainPassword} label="lozinku" />
                </div>
              ) : (
                <span className="text-gray-400 italic">Nije dostupna</span>
              )
            }
          />
        </dl>
      </div>

      {/* Child + parent info */}
      {(hasParentInfo || student.dateOfBirth || student.childSchool) && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Podaci</h2>
          <dl>
            {student.dateOfBirth && (
              <DetailRow
                label="Datum rođenja"
                value={formatDateKey(student.dateOfBirth ?? '')}
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
                  <div className="flex items-center gap-2">
                    <a
                      href={`mailto:${student.parentEmail}`}
                      className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {student.parentEmail}
                    </a>
                    <CopyButton value={student.parentEmail} label="e-mail" />
                  </div>
                }
              />
            )}
            {student.parentPhone && (
              <DetailRow
                label="Telefon roditelja"
                value={
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${student.parentPhone}`}
                      className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {student.parentPhone}
                    </a>
                    <CopyButton value={student.parentPhone} label="telefon" />
                  </div>
                }
              />
            )}
          </dl>
        </div>
      )}

      {/* Year-dependent sections: one selector drives groups + attendance + notes */}
      <StudentYearSections
        studentId={student.id}
        defaultYear={defaultYear}
        enrollments={student.enrollments}
        attendance={attendance}
        gradebookTabs={gradebookTabs}
        recommendationOptions={recommendationOptions}
        isAdmin={isAdmin}
        courses={courseOptions}
        selectedYear={selectedYear}
        onCreateComment={onCreateComment}
        onDeleteComment={onDeleteComment}
        onSaveAssessment={onSaveAssessment}
        onClearAssessment={onClearAssessment}
      />

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

