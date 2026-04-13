import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getGroups } from '@/actions/admin/group'
import { db } from '@/lib/db'
import { GroupTabs } from '@/components/admin/groups/group-tabs'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'
import { CreateGroupDialog } from '@/components/admin/groups/create-group-dialog'

export const metadata: Metadata = { title: 'Admin – Grupe' }

export default async function GroupsPage() {
  await requireAdmin()

  const [groups, courses, locations] = await Promise.all([
    getGroups(),
    db.course.findMany({
      orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, isCustom: true },
    }),
    db.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const standardCourses = courses.filter((c) => !c.isCustom)
  const standardTabs = standardCourses
    .map((course) => ({
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
            {groups.filter((g) => g.isActive).length} aktivnih od {groups.length} {groups.length === 1 ? 'grupe' : 'grupa'}
          </p>
        </div>
        <CreateGroupDialog courses={courseOptions} locations={locations} />
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Tjedni raspored</h2>
        <WeeklySchedule groups={groups} />
      </div>

      <GroupTabs
        standardTabs={standardTabs}
        radioniceTabs={radioniceTabs}
        courses={courseOptions}
        locations={locations}
      />
    </div>
  )
}
