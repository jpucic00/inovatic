import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-guard'
import { getStudent } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { getStudentAttendance } from '@/actions/admin/attendance'
import { createComment, deleteComment } from '@/actions/admin/student-comment'
import {
  clearAssessment,
  upsertAssessment,
} from '@/actions/admin/student-assessment'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { getRecommendationOptions } from '@/lib/student-detail'
import { buildGradebookTabs } from '@/lib/student-assessment-view'
import { StudentDetailView } from '@/components/shared/student-detail-view'

export const metadata: Metadata = { title: 'Admin – Učenik' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [student, courses, attendance, defaultYear, recommendationOptions] =
    await Promise.all([
      getStudent(id),
      getCourses(),
      getStudentAttendance(id),
      getSelectedSchoolYear(),
      getRecommendationOptions(),
    ])

  if (!student) notFound()

  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title }))
  const gradebookTabs = buildGradebookTabs(student, () => true)

  return (
    <StudentDetailView
      viewerRole="ADMIN"
      student={student}
      attendance={attendance}
      gradebookTabs={gradebookTabs}
      recommendationOptions={recommendationOptions}
      courses={courseOptions}
      defaultYear={defaultYear}
      selectedYear={defaultYear}
      backHref="/admin/ucenici"
      backLabel="Natrag na učenike"
      onCreateComment={createComment}
      onDeleteComment={deleteComment}
      onSaveAssessment={upsertAssessment}
      onClearAssessment={clearAssessment}
    />
  )
}
