import type { Metadata } from 'next'
import {
  getStaffGroupMaterials,
  getGroupUploadTargets,
  getGroupGuidesForStaff,
} from '@/actions/teacher/materials'
import { MaterialFilterTabs } from '@/components/material/material-filter-tabs'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'
import { GuideLaunchStrip } from '@/components/teacher/guide-launch-strip'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function TeacherGroupMaterijaliPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const [rows, targets, guideFeed] = await Promise.all([
    getStaffGroupMaterials(groupId),
    getGroupUploadTargets(groupId),
    getGroupGuidesForStaff(groupId),
  ])

  return (
    <div>
      <div className="mb-6">
        <GuideLaunchStrip groupId={groupId} guides={guideFeed.guides} />
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Dodaj novi materijal</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Ovdje dodajete materijale samo za ovu grupu. Programski materijali (za modul ili
              cijeli program) uređuju se na stranici programa.
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <UploadMaterialDialog
              target={{ scope: 'GROUP', scheduledGroupId: targets.groupId }}
              label="Dodaj samo u ovu grupu"
              scopeLabel={`Materijal je vidljiv samo u grupi "${targets.groupName ?? targets.courseTitle}".`}
            />
          </div>
        </div>
      </section>

      <MaterialFilterTabs
        rows={rows}
        modules={targets.modules}
        inGroupId={targets.groupId}
        kind={targets.kind}
      />
    </div>
  )
}
