import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireTeacher } from '@/lib/auth-guard'
import {
  getStudentAttendanceForTeacher,
  getStudentForTeacher,
  getStudentGroupContext,
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
  // A duplicated param (`?grupa=a&grupa=b`) arrives as an array — the honest
  // type keeps the guard below from ever handing Prisma a string[] id.
  searchParams: Promise<{ grupa?: string | string[] }>
}

export default async function TeacherStudentDetailPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const session = await requireTeacher()

  const [{ id }, { grupa }] = await Promise.all([params, searchParams])
  const [student, attendance, recommendationOptions, backGroup] = await Promise.all([
    getStudentForTeacher(id),
    getStudentAttendanceForTeacher(id),
    getRecommendationOptions(),
    typeof grupa === 'string' ? getStudentGroupContext(id, grupa) : null,
  ])

  if (!student) notFound()

  // Opened from a group roster → back goes to that group, named so a student
  // enrolled in two of the teacher's groups says which one. Reached any other
  // way (direct URL, revalidated link) → the groups list, as before.
  const backLabel = backGroup
    ? `Natrag na ${backGroup.name ?? 'grupu'}`
    : 'Natrag na moje grupe'

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
      backHref={backGroup ? `/nastavnik/grupa/${backGroup.id}` : '/nastavnik'}
      backLabel={backLabel}
      onCreateComment={createTeacherComment}
      onDeleteComment={deleteTeacherComment}
      onSaveAssessment={upsertTeacherAssessment}
      onClearAssessment={clearTeacherAssessment}
    />
  )
}
