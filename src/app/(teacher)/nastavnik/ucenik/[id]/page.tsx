import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireTeacher } from '@/lib/auth-guard'
import {
  getStudentForTeacher,
  getStudentAttendanceForTeacher,
} from '@/actions/teacher/student'
import {
  createTeacherComment,
  deleteTeacherComment,
} from '@/actions/teacher/student-comment'
import {
  StudentDetailView,
  buildCommentsPanelTabs,
} from '@/components/shared/student-detail-view'

export const metadata: Metadata = { title: 'Nastavnik – Učenik' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TeacherStudentDetailPage({
  params,
}: Readonly<PageProps>) {
  const session = await requireTeacher()

  const { id } = await params
  const [student, attendance] = await Promise.all([
    getStudentForTeacher(id),
    getStudentAttendanceForTeacher(id),
  ])

  if (!student) notFound()

  const isAdmin = session.user.role === 'ADMIN'
  const viewerId = session.user.id
  const commentsPanelTabs = buildCommentsPanelTabs(
    student,
    attendance,
    (authorId) => isAdmin || authorId === viewerId,
  )

  return (
    <StudentDetailView
      viewerRole="TEACHER"
      student={student}
      attendance={attendance}
      commentsPanelTabs={commentsPanelTabs}
      backHref="/nastavnik"
      backLabel="Natrag na moje grupe"
      onCreateComment={createTeacherComment}
      onDeleteComment={deleteTeacherComment}
    />
  )
}
