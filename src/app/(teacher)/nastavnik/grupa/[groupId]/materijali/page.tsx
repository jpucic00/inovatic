import type { Metadata } from 'next'
import { getStaffGroupMaterials, getGroupUploadTargets } from '@/actions/teacher/materials'
import { MaterialFilterTabs } from '@/components/material/material-filter-tabs'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function TeacherGroupMaterijaliPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const [rows, targets] = await Promise.all([
    getStaffGroupMaterials(groupId),
    getGroupUploadTargets(groupId),
  ])

  return (
    <div>
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Dodaj novi materijal</h2>
        <p className="text-xs text-gray-500 mb-3">
          {targets.isCustom
            ? 'Materijali na razini radionice prikazuju se u svim grupama te radionice. Materijali na razini grupe vide se samo u ovoj grupi.'
            : 'Materijali dodani na razini modula prikazuju se u svim grupama istog programa i modula. Dodajte materijal samo ovoj grupi ako želite iznimku.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <UploadMaterialDialog
            target={{ scope: 'GROUP', scheduledGroupId: targets.groupId }}
            label="Dodaj samo u ovu grupu"
            scopeLabel={`Materijal je vidljiv samo u grupi "${targets.groupName ?? targets.courseTitle}".`}
          />
          {targets.isCustom ? (
            <UploadMaterialDialog
              target={{ scope: 'COURSE', courseId: targets.courseId }}
              label={`Dodaj u cijelu radionicu "${targets.courseTitle}"`}
              scopeLabel="Materijal će biti vidljiv u svim grupama ove radionice."
            />
          ) : (
            targets.modules.map((m) => (
              <UploadMaterialDialog
                key={m.id}
                target={{ scope: 'MODULE', moduleId: m.id }}
                label={`Dodaj u modul: ${m.title}`}
                scopeLabel={`Materijal će biti vidljiv u svim grupama programa "${targets.courseTitle}" za modul "${m.title}".`}
              />
            ))
          )}
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
}
