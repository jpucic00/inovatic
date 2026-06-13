'use server'

import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { computeGroupCapacity } from '@/lib/group-capacity'
import { loadHolidayDateKeys } from '@/lib/holidays'

export type ActiveGroup = {
  id: string
  name: string | null
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  availableSpots: number
  isFull: boolean
  currentModuleName?: string
}

export type ActiveProgram = {
  id: string
  slug: string
  title: string
  level: string | null
  isCustom: boolean
  ageMin: number
  ageMax: number
  price: number | null
  groups: ActiveGroup[]
}

type GroupRow = Awaited<ReturnType<typeof db.scheduledGroup.findMany>>[number] & {
  course: {
    id: string; slug: string; title: string; level: string | null;
    isCustom: boolean; ageMin: number; ageMax: number; price: number | null;
    sortOrder: number;
    modules: {
      id: string; title: string; sortOrder: number;
      schedules: {
        id: string; schoolYear: string;
        startDate: Date | null; endDate: Date | null;
      }[];
    }[];
  };
  enrollments: { id: string; moduleEnrollments: { moduleScheduleId: string }[] }[];
  _count: { preferredInquiries: number };
}

function toActiveGroup(
  g: GroupRow,
  holidayDates: ReadonlySet<string>,
  now: Date,
): ActiveGroup | null {
  const { availableSpots, isFull, nextEnrollingModule } = computeGroupCapacity(
    g,
    holidayDates,
    now,
  )
  // Standard course hidden from public form when no next module exists for
  // this group's arc (race-ahead past M4 → graduated, or schedule incomplete).
  if (!g.course.isCustom && !nextEnrollingModule) return null

  return {
    id: g.id,
    name: g.name,
    dayOfWeek: g.dayOfWeek,
    dateStart: g.dateStart,
    dateEnd: g.dateEnd,
    startTime: g.startTime,
    endTime: g.endTime,
    availableSpots,
    isFull,
    ...(nextEnrollingModule ? { currentModuleName: nextEnrollingModule.title } : {}),
  }
}

export async function getActivePrograms(): Promise<ActiveProgram[]> {
  const now = new Date()
  const yearFloor = computeSchoolYear()

  // The signup window now lives per (course, schoolYear) on
  // CourseEnrollmentWindow. A group is publicly enrollable only when its
  // program has an OPEN window for the group's own school year. Prisma can't
  // correlate the window's schoolYear to each group's schoolYear in a single
  // `where`, so resolve open windows first and gate groups on the composite key.
  const openWindows = await db.courseEnrollmentWindow.findMany({
    where: { enrollmentStart: { lte: now }, enrollmentEnd: { gte: now } },
    select: { courseId: true, schoolYear: true },
  })
  if (openWindows.length === 0) return []
  const openKeys = new Set(openWindows.map((w) => `${w.courseId}::${w.schoolYear}`))
  const openCourseIds = Array.from(new Set(openWindows.map((w) => w.courseId)))

  const groups = await db.scheduledGroup.findMany({
    where: { courseId: { in: openCourseIds } },
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          level: true,
          isCustom: true,
          ageMin: true,
          ageMax: true,
          price: true,
          sortOrder: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: { gte: yearFloor } },
                select: {
                  id: true,
                  schoolYear: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: {
            select: { moduleScheduleId: true },
          },
        },
      },
      _count: {
        select: {
          preferredInquiries: { where: { status: 'NEW' } },
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  // Group holidays by school year so each group resolves its arc against
  // its OWN year's holiday set. Most realistic data has one current school
  // year + at most one upcoming, so we end up with ≤2 distinct keys here
  // and the same number of holiday-table queries — bounded, not per-group.
  const distinctYears = new Set(groups.map((g) => g.schoolYear))
  const holidaysByYear = new Map<string, Set<string>>()
  await Promise.all(
    Array.from(distinctYears).map(async (year) => {
      holidaysByYear.set(year, await loadHolidayDateKeys(year))
    }),
  )

  const courseMap = new Map<string, ActiveProgram>()
  for (const g of groups) {
    // Gate on the group's own (course, year) window being open.
    if (!openKeys.has(`${g.courseId}::${g.schoolYear}`)) continue
    const activeGroup = toActiveGroup(
      g,
      holidaysByYear.get(g.schoolYear) ?? new Set(),
      now,
    )
    if (!activeGroup) continue

    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, {
        id: g.course.id,
        slug: g.course.slug,
        title: g.course.title,
        level: g.course.level,
        isCustom: g.course.isCustom,
        ageMin: g.course.ageMin,
        ageMax: g.course.ageMax,
        price: g.course.price,
        groups: [],
      })
    }

    courseMap.get(g.courseId)!.groups.push(activeGroup)
  }

  return Array.from(courseMap.values())
}
