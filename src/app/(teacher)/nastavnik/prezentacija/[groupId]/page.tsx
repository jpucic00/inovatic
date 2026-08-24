import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGroupGuidesForStaff } from '@/actions/teacher/materials'
import { GuidePresenter } from '@/components/teacher/guide-presenter'

export const metadata: Metadata = { title: 'Prezentacija' }

/**
 * Sits outside `grupa/[groupId]` on purpose: nothing of the group's own tab
 * chrome should render behind a full-screen lesson view, not even hidden.
 */
export default async function TeacherPresentPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const feed = await getGroupGuidesForStaff(groupId)

  // Reached only from a button that is not rendered without a guide; a stale
  // link (the material was deleted or hidden since) lands here.
  if (feed.guides.length === 0) notFound()

  return (
    <GuidePresenter
      guides={feed.guides}
      groupLabel={
        feed.groupName ? `${feed.courseTitle} · ${feed.groupName}` : feed.courseTitle
      }
      backHref={`/nastavnik/grupa/${feed.groupId}/materijali`}
    />
  )
}
