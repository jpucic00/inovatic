import type { Metadata } from 'next'
import { getEffectiveMaterialsForStudent } from '@/actions/student/materials'
import { MaterialList } from '@/components/portal/material-list'

export const metadata: Metadata = { title: 'Materijali grupe' }

export default async function GroupMaterialsPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const view = await getEffectiveMaterialsForStudent(groupId)
  return <MaterialList view={view} />
}
