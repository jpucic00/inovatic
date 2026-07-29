import type { Metadata } from 'next'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getGroups } from '@/actions/admin/group'
import { getAssignableTeachers } from '@/actions/admin/teacher'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { db } from '@/lib/db'
import { AdminGroupTabs } from '@/components/admin/groups/group-tabs'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'
import { CreateGroupDialog } from '@/components/admin/groups/create-group-dialog'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'
import { isRadionica } from '@/lib/program-kind'

export const metadata: Metadata = { title: 'Admin – Grupe' }

export default async function GroupsPage() {
  const { city } = await requireAdminCtx()

  const selectedYear = await getSelectedSchoolYear()
  const editable = !isArchivedYear(selectedYear)

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
      select: { id: true, title: true, kind: true },
    }),
    db.location.findMany({
      where: { city },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    getAssignableTeachers(),
  ])

  // Every non-radionica program gets its own tab (SLR 1–4 and the competitive
  // program); radionica groups share one combined tab.
  const standardCourses = courses.filter((c) => !isRadionica(c.kind))
  const standardTabs = standardCourses.map((course) => ({
    courseId: course.id,
    title: course.title,
    groups: groups.filter((g) => g.course.id === course.id),
  }))

  const radioniceTabs = groups.filter((g) => isRadionica(g.course.kind))

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

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Tjedni raspored</h2>
        <WeeklySchedule groups={groups} />
      </div>

      <AdminGroupTabs
        standardTabs={standardTabs}
        radioniceTabs={radioniceTabs}
        editable={editable}
      />
    </div>
  )
}
