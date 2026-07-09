import type { Metadata } from 'next'
import { getEffectiveMaterialsForStudent } from '@/actions/student/materials'
import { GroupMaterialsScreen } from '@/components/portal/group-materials-screen'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function GroupMaterialsPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getEffectiveMaterialsForStudent(groupId)
  return (
    <GroupMaterialsScreen
      view={view}
      backHref="/portal"
      backLabel="Natrag na moje grupe"
    />
  )
}
