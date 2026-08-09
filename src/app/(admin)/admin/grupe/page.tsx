import type { Metadata } from 'next'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getGroups } from '@/actions/admin/group'
import { getAssignableTeachers } from '@/actions/admin/teacher'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { db } from '@/lib/db'
import { GroupsBoard } from '@/components/admin/groups/groups-board'
import { CreateGroupDialog } from '@/components/admin/groups/create-group-dialog'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'
import { ListFilterMemory } from '@/components/admin/list-filter-memory'
import { resolveGroupFilter } from '@/lib/group-filter'

export const metadata: Metadata = { title: 'Admin – Grupe' }

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function GroupsPage({ searchParams }: Readonly<PageProps>) {
  const { city } = await requireAdminCtx()

  const selectedYear = await getSelectedSchoolYear()
  const editable = !isArchivedYear(selectedYear)
  const params = await searchParams

  const [groups, courses, locations, teachers] = await Promise.all([
    getGroups(),
    db.course.findMany({
      // Standard SLR programs are global (schoolYear = null) and always appear.
      // Radionice are year-scoped — only those stamped with the selected year.
      // Shared standard programs have city = null; radionice belong to one city.
      where: {
        AND: [
          { OR: [{ kind: { not: 'RADIONICA' } }, { schoolYear: selectedYear }] },
          { OR: [{ city: null }, { city }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }],
      select: { id: true, title: true, kind: true, level: true },
    }),
    db.location.findMany({
      where: { city },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    getAssignableTeachers(),
  ])

  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title, kind: c.kind }))

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grupe</h1>
          <p className="text-gray-500 text-sm mt-1">
            {groups.length} grupa u {selectedYear}
          </p>
        </div>
        {editable && (
          <CreateGroupDialog
            courses={courseOptions}
            locations={locations}
            currentYear={selectedYear}
            teachers={teachers}
          />
        )}
      </div>

      {!editable && <ArchivedYearBanner year={selectedYear} />}

      {/* Restore only — the chip bar below already names the active program. */}
      <ListFilterMemory listPath="/admin/grupe" chips={[]} />

      <GroupsBoard
        groups={groups}
        editable={editable}
        initialFilter={resolveGroupFilter(params.tab, courses)}
      />
    </div>
  )
}
