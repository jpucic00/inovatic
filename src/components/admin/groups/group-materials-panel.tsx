import { getStaffGroupMaterials } from '@/actions/teacher/materials'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'
import { StaffMaterialList } from '@/components/material/staff-material-list'

/**
 * Admin group-detail materials panel: add/edit/delete this group's own (GROUP)
 * materials, and hide/show inherited program (MODULE/COURSE) materials for this
 * group. Inherited materials are edited on the program page, not here.
 */
export async function GroupMaterialsPanel({
  groupId,
  editable,
}: Readonly<{ groupId: string; editable: boolean }>) {
  const rows = await getStaffGroupMaterials(groupId)

  return (
    <div className="bg-white rounded-xl border p-6 mt-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Materijali</h2>
        {editable && (
          <UploadMaterialDialog
            target={{ scope: 'GROUP', scheduledGroupId: groupId }}
            label="Dodaj"
            scopeLabel="Vidljivo samo u ovoj grupi."
          />
        )}
      </div>
      <StaffMaterialList
        rows={rows}
        inGroupId={groupId}
        emptyLabel="Još nema materijala za ovu grupu."
      />
    </div>
  )
}
