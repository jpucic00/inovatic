import type { Metadata } from 'next'
import { getGroupAttendance } from '@/actions/teacher/attendance'
import { AttendanceMarker } from '@/components/teacher/attendance-marker'

export const metadata: Metadata = { title: 'Dolazak grupe' }

export default async function TeacherGroupDolazakPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const data = await getGroupAttendance(groupId)

  return <AttendanceMarker {...data} />
}
