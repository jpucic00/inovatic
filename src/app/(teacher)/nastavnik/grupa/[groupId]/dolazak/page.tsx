import type { Metadata } from 'next'
import { getGroupAttendance } from '@/actions/teacher/attendance'
import { AttendanceMarker } from '@/components/teacher/attendance-marker'

export const metadata: Metadata = { title: 'Dolazak grupe' }

export default async function TeacherGroupDolazakPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const data = await getGroupAttendance(groupId)

  return (
    <AttendanceMarker
      groupId={data.groupId}
      isCustom={data.isCustom}
      dayOfWeek={data.dayOfWeek}
      dateStart={data.dateStart}
      dateEnd={data.dateEnd}
      startTime={data.startTime}
      endTime={data.endTime}
      expectedSessions={data.expectedSessions}
      extraSessions={data.extraSessions}
      roster={data.roster}
      records={data.records}
    />
  )
}
