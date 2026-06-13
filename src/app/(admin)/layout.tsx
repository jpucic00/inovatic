import { Toaster } from '@/components/ui/toaster'
import { requireAdmin } from '@/lib/auth-guard'
import { AdminDesktopSidebar, AdminMobileNav } from '@/components/admin/admin-mobile-nav'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { getAllSchoolYears } from '@/actions/admin/school-year'
import { computeSchoolYear, isArchivedYear, schoolYearNeedsPlanning } from '@/lib/school-year'
import { db } from '@/lib/db'

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin()
  const userName = session.user.name ?? session.user.email ?? 'Admin'

  const [selectedYear, years] = await Promise.all([
    getSelectedSchoolYear(),
    getAllSchoolYears(),
  ])
  const currentYear = computeSchoolYear()

  // Drive the "plan the year" badge: the selected non-archived year needs
  // planning when it has no standard-program module dates or no holidays yet.
  const [datedModuleCount, holidayCount] = await Promise.all([
    db.moduleSchedule.count({
      where: {
        schoolYear: selectedYear,
        module: { course: { isCustom: false } },
        OR: [{ startDate: { not: null } }, { endDate: { not: null } }],
      },
    }),
    db.schoolYearHoliday.count({ where: { schoolYear: selectedYear } }),
  ])
  const calendarNeedsPlanning = schoolYearNeedsPlanning({
    archived: isArchivedYear(selectedYear),
    datedModuleCount,
    holidayCount,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminMobileNav
        userName={userName}
        years={years}
        selectedYear={selectedYear}
        currentYear={currentYear}
        calendarNeedsPlanning={calendarNeedsPlanning}
      />

      <div className="flex">
        <AdminDesktopSidebar
          userName={userName}
          years={years}
          selectedYear={selectedYear}
          currentYear={currentYear}
          calendarNeedsPlanning={calendarNeedsPlanning}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-4 pt-18 lg:p-8 lg:pt-8 overflow-x-hidden">{children}</main>
        </div>
      </div>

      <Toaster />
    </div>
  )
}
