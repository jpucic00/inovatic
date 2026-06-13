import type { Metadata } from 'next'
import {
  getStaffGroupMaterials,
  getGroupUploadTargets,
  getGroupMaterialsViewForStaff,
} from '@/actions/teacher/materials'
import { MaterialFilterTabs } from '@/components/material/material-filter-tabs'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'
import { MaterialList } from '@/components/portal/material-list'
import { MaterialsWorkspace } from '@/components/teacher/materials-workspace'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function TeacherGroupMaterijaliPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const [rows, targets, previewView] = await Promise.all([
    getStaffGroupMaterials(groupId),
    getGroupUploadTargets(groupId),
    getGroupMaterialsViewForStaff(groupId),
  ])

  const manage = (
    <div>
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Dodaj novi materijal</h2>
        <p className="text-xs text-gray-500 mb-3">
          Ovdje dodajete materijale samo za ovu grupu. Programski materijali (za modul ili cijeli
          program) uređuju se na stranici programa.
        </p>
        <div className="flex flex-wrap gap-2">
          <UploadMaterialDialog
            target={{ scope: 'GROUP', scheduledGroupId: targets.groupId }}
            label="Dodaj samo u ovu grupu"
            scopeLabel={`Materijal je vidljiv samo u grupi "${targets.groupName ?? targets.courseTitle}".`}
          />
        </div>
      </section>

      <MaterialFilterTabs
        rows={rows}
        modules={targets.modules}
        inGroupId={targets.groupId}
        isCustom={targets.isCustom}
      />
    </div>
  )

  return <MaterialsWorkspace manage={manage} preview={<MaterialList view={previewView} />} />
}
