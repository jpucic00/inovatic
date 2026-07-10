import { Toaster } from '@/components/ui/toaster'
import { requireAdminCtx } from '@/lib/auth-guard'
import { AdminDesktopSidebar, AdminMobileNav } from '@/components/admin/admin-mobile-nav'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { getAllSchoolYears } from '@/actions/admin/school-year'
import { computeSchoolYear, isArchivedYear, schoolYearNeedsPlanning } from '@/lib/school-year'
import { CITY_LABELS } from '@/lib/city'
import { db } from '@/lib/db'

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { session, city } = await requireAdminCtx()
  const userName = session.user.name ?? session.user.email ?? 'Admin'
  const cityLabel = CITY_LABELS[city]

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
        city,
        module: { course: { isCustom: false } },
        OR: [{ startDate: { not: null } }, { endDate: { not: null } }],
      },
    }),
    db.schoolYearHoliday.count({ where: { schoolYear: selectedYear, city } }),
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
        cityLabel={cityLabel}
        years={years}
        selectedYear={selectedYear}
        currentYear={currentYear}
        calendarNeedsPlanning={calendarNeedsPlanning}
      />

      <div className="flex">
        <AdminDesktopSidebar
          userName={userName}
          cityLabel={cityLabel}
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
