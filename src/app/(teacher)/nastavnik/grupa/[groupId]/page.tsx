import type { Metadata } from 'next'
import { getGroupRoster } from '@/actions/teacher/group'
import { GroupRosterTable } from '@/components/teacher/group-roster-table'

export const metadata: Metadata = { title: 'Polaznici grupe' }

export default async function TeacherGroupPolazniciPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const roster = await getGroupRoster(groupId)
  return <GroupRosterTable rows={roster} />
}
