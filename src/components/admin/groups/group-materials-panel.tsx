import { getGroupUploadTargets, getStaffGroupLessons } from '@/actions/teacher/materials'
import { isCompetition } from '@/lib/program-kind'
import { GroupLessons } from '@/components/teacher/group-lessons/group-lessons'

/**
 * Admin group-detail materials: the same lesson-by-lesson view the teacher
 * has, so both sides talk about the same screen: a reading tree where the
 * group's own materials are added (modal) and deleted, and nothing is edited,
 * moved or hidden (owner, 2026-10-10). Curriculum is edited on the program
 * page. An archived year is read-only.
 */
export async function GroupMaterialsPanel({
  groupId,
  editable,
}: Readonly<{ groupId: string; editable: boolean }>) {
  const [lessons, targets] = await Promise.all([
    getStaffGroupLessons(groupId),
    getGroupUploadTargets(groupId),
  ])

  return (
    <section className="mt-6 rounded-xl border bg-white p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Materijali</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {editable
            ? 'Lekcije i programski materijali uređuju se na stranici programa. Ovdje se dodaju materijali samo za ovu grupu.'
            : 'Arhivirana školska godina — materijali su prikazani kakvi su bili.'}
        </p>
      </div>
      <GroupLessons
        data={lessons}
        editable={editable}
        competition={isCompetition(targets.kind)}
      />
    </section>
  )
}
