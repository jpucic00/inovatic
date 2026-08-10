import type { Metadata } from 'next'
import { getMyAssignedGroups } from '@/actions/teacher/dashboard'
import { computeSchoolYear } from '@/lib/school-year'
import { TeacherGroupsBoard } from '@/components/teacher/teacher-groups-board'

export const metadata: Metadata = {
  title: 'Nastavnik – Moje grupe',
}

export default async function TeacherDashboard() {
  const groups = await getMyAssignedGroups()

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moje grupe</h1>
      </div>

      <TeacherGroupsBoard groups={groups} currentYear={computeSchoolYear()} />
    </div>
  )
}
