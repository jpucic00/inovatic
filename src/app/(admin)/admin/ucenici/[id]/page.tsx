import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-guard'
import { getStudent } from '@/actions/admin/student'
import { getCourses } from '@/actions/admin/course'
import { getStudentAttendance } from '@/actions/admin/attendance'
import { createComment, deleteComment } from '@/actions/admin/student-comment'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import {
  StudentDetailView,
  buildCommentsPanelTabs,
} from '@/components/shared/student-detail-view'

export const metadata: Metadata = { title: 'Admin – Učenik' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [student, courses, attendance, defaultYear] = await Promise.all([
    getStudent(id),
    getCourses(),
    getStudentAttendance(id),
    getSelectedSchoolYear(),
  ])

  if (!student) notFound()

  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title }))
  const commentsPanelTabs = buildCommentsPanelTabs(student, attendance, () => true)

  return (
    <StudentDetailView
      viewerRole="ADMIN"
      student={student}
      attendance={attendance}
      commentsPanelTabs={commentsPanelTabs}
      courses={courseOptions}
      defaultYear={defaultYear}
      selectedYear={defaultYear}
      backHref="/admin/ucenici"
      backLabel="Natrag na učenike"
      onCreateComment={createComment}
      onDeleteComment={deleteComment}
    />
  )
}
