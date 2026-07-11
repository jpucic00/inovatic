import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireTeacher } from '@/lib/auth-guard'
import {
  getStudentAttendanceForTeacher,
  getStudentForTeacher,
} from '@/actions/teacher/student'
import {
  createTeacherComment,
  deleteTeacherComment,
} from '@/actions/teacher/student-comment'
import {
  clearTeacherAssessment,
  upsertTeacherAssessment,
} from '@/actions/teacher/student-assessment'
import { computeSchoolYear } from '@/lib/school-year'
import { getRecommendationOptions } from '@/lib/student-detail'
import { buildGradebookTabs } from '@/lib/student-assessment-view'
import { StudentDetailView } from '@/components/shared/student-detail-view'

export const metadata: Metadata = { title: 'Nastavnik – Učenik' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TeacherStudentDetailPage({
  params,
}: Readonly<PageProps>) {
  const session = await requireTeacher()

  const { id } = await params
  const [student, attendance, recommendationOptions] = await Promise.all([
    getStudentForTeacher(id),
    getStudentAttendanceForTeacher(id),
    getRecommendationOptions(),
  ])

  if (!student) notFound()

  const isAdmin = session.user.role === 'ADMIN'
  const viewerId = session.user.id
  const gradebookTabs = buildGradebookTabs(
    student,
    (authorId) => isAdmin || authorId === viewerId,
  )

  return (
    <StudentDetailView
      viewerRole="TEACHER"
      student={student}
      attendance={attendance}
      gradebookTabs={gradebookTabs}
      recommendationOptions={recommendationOptions}
      defaultYear={computeSchoolYear()}
      backHref="/nastavnik"
      backLabel="Natrag na moje grupe"
      onCreateComment={createTeacherComment}
      onDeleteComment={deleteTeacherComment}
      onSaveAssessment={upsertTeacherAssessment}
      onClearAssessment={clearTeacherAssessment}
    />
  )
}
