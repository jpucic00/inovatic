import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getLessonEditorContext } from '@/actions/admin/program-materials'
import { LessonEditor } from '@/components/admin/lessons/lesson-editor'

export const metadata: Metadata = { title: 'Admin – Lekcija' }

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const { courseId, lessonId } = await params
  const context = await getLessonEditorContext(courseId, { lessonId })
  // Keyed by the lesson so a client-side hop to a sibling lesson starts from
  // that lesson's own values, not the previous form's state.
  return <LessonEditor key={lessonId} context={context} />
}
