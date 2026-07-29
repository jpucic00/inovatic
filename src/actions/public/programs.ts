'use server'

import type { City, Prisma, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { computeGroupCapacity } from '@/lib/group-capacity'
import { hasDatedModules, isRadionica } from '@/lib/program-kind'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { isRadionicaOpenForSignup } from '@/lib/session-dates'

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
  kind: ProgramKind
  ageMin: number
  ageMax: number
  price: number | null
  groups: ActiveGroup[]
}

type GroupRow = Awaited<ReturnType<typeof db.scheduledGroup.findMany>>[number] & {
  course: {
    id: string; slug: string; title: string; level: string | null;
    kind: ProgramKind; ageMin: number; ageMax: number; price: number | null;
    sortOrder: number;
    modules: {
      id: string; title: string; sortOrder: number;
      schedules: {
        id: string; schoolYear: string; city: import('@prisma/client').City;
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
  // Standard course hidden from the form when no next module exists for this
  // group's arc (race-ahead past M4 → graduated, or schedule incomplete).
  // Radionica and competition groups have no arc to run out of.
  if (hasDatedModules(g.course.kind) && !nextEnrollingModule) return null
  // A radionica runs once, on a fixed date range — once its first day arrives
  // there is nothing left to sign up for, so it stops being offered as a termin.
  // Competition groups run a whole season and standard groups are paced by
  // their module arc, so neither expires this way.
  if (isRadionica(g.course.kind) && !isRadionicaOpenForSignup(g.dateStart, now)) {
    return null
  }

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

/**
 * Programs a parent may currently sign up for in `city`, with their open groups.
 *
 * `courseWhere` narrows which programs are in scope, and is the ONLY difference
 * between the public feed and the per-program signup link:
 *   - `/upisi` + `/api/group-availability` exclude COMPETITION entirely — the
 *     competitive track is invitation-only and must never appear in a public
 *     listing.
 *   - `/upisi/<slug>` asks for exactly one program by slug, competition included.
 *
 * Everything else — the per-city enrollment window, capacity, holiday-aware
 * module arcs, the radionica start-date cutoff — is shared, so the two feeds can
 * never drift apart.
 */
async function loadPrograms(
  city: City,
  courseWhere: Prisma.CourseWhereInput,
): Promise<ActiveProgram[]> {
  const now = new Date()
  const yearFloor = computeSchoolYear()

  // The signup window now lives per (course, schoolYear, city) on
  // CourseEnrollmentWindow. A group is publicly enrollable only when its
  // program has an OPEN window for the group's own school year AND the caller's
  // city — a Split window must never expose Šibenik groups or vice versa.
  // Prisma can't correlate the window's schoolYear to each group's schoolYear
  // in a single `where`, so resolve this city's open windows first and gate
  // groups on the composite key.
  const openWindows = await db.courseEnrollmentWindow.findMany({
    where: {
      city,
      enrollmentStart: { lte: now },
      enrollmentEnd: { gte: now },
      course: courseWhere,
    },
    select: { courseId: true, schoolYear: true, city: true },
  })
  if (openWindows.length === 0) return []
  // Windows are per-city: a group is enrollable only when ITS city's window
  // is open — a Split window must never expose Šibenik groups or vice versa.
  const openKeys = new Set(
    openWindows.map((w) => `${w.courseId}::${w.schoolYear}::${w.city}`),
  )
  const openCourseIds = Array.from(new Set(openWindows.map((w) => w.courseId)))

  const groups = await db.scheduledGroup.findMany({
    where: { city, courseId: { in: openCourseIds } },
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          level: true,
          kind: true,
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
                  city: true,
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

  // Group holidays by (school year, city) so each group resolves its arc
  // against its OWN year's AND city's holiday set. Bounded: at most
  // years × 2 cities distinct keys, one holiday-table query each — never
  // per-group.
  const distinctKeys = new Set(groups.map((g) => `${g.schoolYear}::${g.city}`))
  const holidaysByYearCity = new Map<string, Set<string>>()
  await Promise.all(
    Array.from(distinctKeys).map(async (key) => {
      const [year, city] = key.split('::') as [string, (typeof groups)[number]['city']]
      holidaysByYearCity.set(key, await loadHolidayDateKeys(year, city))
    }),
  )

  const courseMap = new Map<string, ActiveProgram>()
  for (const g of groups) {
    // Gate on the group's own (course, year, city) window being open.
    if (!openKeys.has(`${g.courseId}::${g.schoolYear}::${g.city}`)) continue
    const activeGroup = toActiveGroup(
      g,
      holidaysByYearCity.get(`${g.schoolYear}::${g.city}`) ?? new Set(),
      now,
    )
    if (!activeGroup) continue

    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, {
        id: g.course.id,
        slug: g.course.slug,
        title: g.course.title,
        level: g.course.level,
        kind: g.course.kind,
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

/**
 * The public `/upisi` catalog. COMPETITION is deliberately absent: signing up
 * for the competitive track happens only through the invitation link.
 */
export async function getActivePrograms(city: City): Promise<ActiveProgram[]> {
  return loadPrograms(city, { kind: { not: 'COMPETITION' } })
}

/**
 * One program by slug, for its own signup link (`/upisi/<slug>`). Returns null
 * when the slug is unknown or that program has no open window / no bookable
 * group in this city — the page renders a closed-signups state either way, so a
 * link already mailed out never has to be retracted.
 */
export async function getSignupProgram(
  city: City,
  slug: string,
): Promise<ActiveProgram | null> {
  if (!slug) return null
  const programs = await loadPrograms(city, { slug })
  return programs[0] ?? null
}

/**
 * The same single-program feed, by id — what the form's live availability poll
 * asks for on a per-program signup link. It must NOT fall back to
 * `getActivePrograms`: that feed excludes COMPETITION, so a poll answered from
 * it would blank out the competition termini a few seconds after the page
 * rendered them.
 */
export async function getSignupProgramById(
  city: City,
  courseId: string,
): Promise<ActiveProgram | null> {
  if (!courseId) return null
  const programs = await loadPrograms(city, { id: courseId })
  return programs[0] ?? null
}
