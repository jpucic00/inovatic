import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getGroups } from '@/actions/admin/group'
import { getAssignableTeachers } from '@/actions/admin/teacher'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { db } from '@/lib/db'
import { GroupTabs } from '@/components/admin/groups/group-tabs'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'
import { CreateGroupDialog } from '@/components/admin/groups/create-group-dialog'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'

export const metadata: Metadata = { title: 'Admin – Grupe' }

export default async function GroupsPage() {
  await requireAdmin()

  const selectedYear = await getSelectedSchoolYear()
  const editable = !isArchivedYear(selectedYear)

  const [groups, courses, locations, teachers] = await Promise.all([
    getGroups(),
    db.course.findMany({
      // Standard SLR programs are global (schoolYear = null) and always appear.
      // Radionice are year-scoped — only those stamped with the selected year.
      where: { OR: [{ isCustom: false }, { schoolYear: selectedYear }] },
      orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, isCustom: true },
    }),
    db.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    getAssignableTeachers(),
  ])

  const standardCourses = courses.filter((c) => !c.isCustom)
  const standardTabs = standardCourses.map((course) => ({
    courseId: course.id,
    title: course.title,
    groups: groups.filter((g) => g.course.id === course.id),
  }))

  const radioniceTabs = groups.filter((g) => g.course.isCustom)

  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title, isCustom: c.isCustom }))

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

      <GroupTabs
        standardTabs={standardTabs}
        radioniceTabs={radioniceTabs}
        editable={editable}
      />
    </div>
  )
}
