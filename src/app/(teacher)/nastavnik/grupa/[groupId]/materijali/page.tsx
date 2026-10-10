import type { Metadata } from 'next'
import {
  getGroupGuidesForStaff,
  getGroupUploadTargets,
  getStaffGroupLessons,
} from '@/actions/teacher/materials'
import { isCompetition } from '@/lib/program-kind'
import { GuideLaunchStrip } from '@/components/teacher/guide-launch-strip'
import { GroupLessons } from '@/components/teacher/group-lessons/group-lessons'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function TeacherGroupMaterijaliPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const [lessons, guideFeed, targets] = await Promise.all([
    getStaffGroupLessons(groupId),
    getGroupGuidesForStaff(groupId),
    getGroupUploadTargets(groupId),
  ])

  return (
    <div>
      <div className="mb-6">
        <GuideLaunchStrip groupId={groupId} guides={guideFeed.guides} />
      </div>

      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Materijali po lekcijama</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Lekcije i programske materijale postavlja administracija na stranici programa. Ovdje
          dodajete materijale samo za ovu grupu, a programski materijal koji grupi ne treba možete
          sakriti.
        </p>
      </div>

      <GroupLessons
        data={lessons}
        editable
        competition={isCompetition(targets.kind)}
      />
    </div>
  )
}
