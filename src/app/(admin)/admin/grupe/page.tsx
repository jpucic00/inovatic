import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getGroups, getGroupSchoolYears } from '@/actions/admin/group'
import { computeSchoolYear } from '@/lib/school-year'
import { db } from '@/lib/db'
import { GroupTabs } from '@/components/admin/groups/group-tabs'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'
import { CreateGroupDialog } from '@/components/admin/groups/create-group-dialog'
import { SchoolYearSelector } from '@/components/admin/courses/school-year-selector'

export const metadata: Metadata = { title: 'Admin – Grupe' }

interface PageProps {
  searchParams: Promise<{ schoolYear?: string }>
}

export default async function GroupsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()

  const { schoolYear: yearParam } = await searchParams
  const currentYear = computeSchoolYear()
  const selectedYear = yearParam ?? currentYear

  const [groups, years, courses, locations] = await Promise.all([
    getGroups({ schoolYear: selectedYear }),
    getGroupSchoolYears(),
    db.course.findMany({
      orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, isCustom: true },
    }),
    db.location.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  // Ensure current year always appears in the selector
  const allYears = years.includes(currentYear) ? years : [currentYear, ...years]

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
            {groups.length} {groups.length === 1 ? 'grupa' : 'grupa'} u {selectedYear}
          </p>
        </div>
        <CreateGroupDialog courses={courseOptions} locations={locations} currentYear={selectedYear} />
      </div>

      <div className="mb-6">
        <SchoolYearSelector
          years={allYears}
          currentYear={currentYear}
          selectedYear={selectedYear}
          basePath="/admin/grupe"
          showCreateButton={false}
        />
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
