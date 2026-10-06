'use server'

import type { City, Prisma, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear, getNextSchoolYear, schoolYearOfDateKey } from '@/lib/school-year'
import { computeGroupCapacity, RESERVING_INQUIRY_WHERE } from '@/lib/group-capacity'
import { hasDatedModules, isRadionica } from '@/lib/program-kind'
import { loadHolidayDateKeys } from '@/lib/holidays'
import {
  isRadionicaOpenForSignup,
} from '@/lib/session-dates'
import { zagrebDateKey } from '@/lib/attendance-window'
import type { ScheduleProgram } from '@/lib/public-schedule'
import type { CourseGradeRules } from '@/lib/inquiry-availability'
import type { Grade } from '@/lib/inquiry-status'

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
  /** The venue as stored on the Location row — what the public schedule prints. */
  locationName: string
  locationAddress: string
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
  location: { name: string; address: string };
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
    locationName: g.location.name,
    locationAddress: g.location.address,
  }
}

/** A (course, year) window of `city` that is open at `now`. */
function openWindowWhere(city: City, now: Date): Prisma.CourseEnrollmentWindowWhereInput {
  return { city, enrollmentStart: { lte: now }, enrollmentEnd: { gte: now } }
}

/**
 * Programs a parent may currently sign up for in `city`, with their open groups.
 *
 * `courseWhere` narrows which programs are in scope, and is the ONLY difference
 * between the public feed and the per-program signup link:
 *   - `/prijava` + `/api/group-availability` exclude COMPETITION entirely — the
 *     competitive track is invitation-only and must never appear in a public
 *     listing.
 *   - `/prijava/<slug>` asks for exactly one program by slug, competition included.
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
    where: { ...openWindowWhere(city, now), course: courseWhere },
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
          preferredInquiries: { where: RESERVING_INQUIRY_WHERE },
        },
      },
      location: { select: { name: true, address: true } },
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
 * The public `/prijava` catalog. COMPETITION is deliberately absent: signing up
 * for the competitive track happens only through the invitation link.
 */
export async function getActivePrograms(city: City): Promise<ActiveProgram[]> {
  return loadPrograms(city, { kind: { not: 'COMPETITION' } })
}

/** The programs `/raspored` lists — the same public set as `/prijava`. */
const PUBLIC_SCHEDULE_COURSES: Prisma.CourseWhereInput = { kind: { not: 'COMPETITION' } }

/**
 * Which school year the closed half of `/raspored` lists. The school year flips
 * on 1 September, so through July and August "current" names the year that has
 * just ended; once the city has groups for the coming one, those are the
 * timetable a parent is looking for (owner, 2026-10-06). Otherwise the ending
 * year stays — better last year's termini than an empty page.
 */
async function closedScheduleYear(city: City, today: string): Promise<string> {
  const current = schoolYearOfDateKey(today)
  const month = Number(today.slice(5, 7))
  if (month !== 7 && month !== 8) return current
  const next = getNextSchoolYear(current)
  const upcoming = await db.scheduledGroup.findFirst({
    where: { city, schoolYear: next, course: PUBLIC_SCHEDULE_COURSES },
    select: { id: true },
  })
  return upcoming ? next : current
}

/**
 * Everything `/raspored` shows for `city`: the schedule is public all year,
 * while seats are only spoken about where a parent can actually take one.
 *
 * Decided per PROGRAM, by whether it has an open window (owner, 2026-10-05):
 *   - open → exactly the `/prijava` feed, spots included, so the schedule can
 *     never name a termin the form refuses or hide one it offers;
 *   - closed → its groups in the current school year (the coming one through
 *     the summer, see {@link closedScheduleYear}), with `availableSpots:
 *     null`. No capacity, no module-arc gate: a running group is part of the
 *     timetable whether or not it takes anyone new. A radionica that has already
 *     ended is dropped — it is history, not schedule.
 *
 * Competition stays out of both halves (invitation-only, never in a public listing).
 */
export async function getPublicSchedulePrograms(city: City): Promise<ScheduleProgram[]> {
  const now = new Date()
  const [open, openWindows] = await Promise.all([
    loadPrograms(city, PUBLIC_SCHEDULE_COURSES),
    db.courseEnrollmentWindow.findMany({
      where: { ...openWindowWhere(city, now), course: PUBLIC_SCHEDULE_COURSES },
      select: { courseId: true, course: { select: { sortOrder: true } } },
    }),
  ])
  const sortOrders = new Map(openWindows.map((w) => [w.courseId, w.course.sortOrder]))
  const openCourseIds = Array.from(sortOrders.keys())

  const today = zagrebDateKey(now)
  const groups = await db.scheduledGroup.findMany({
    where: {
      city,
      schoolYear: await closedScheduleYear(city, today),
      courseId: { notIn: openCourseIds },
      course: PUBLIC_SCHEDULE_COURSES,
    },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      dateStart: true,
      dateEnd: true,
      startTime: true,
      endTime: true,
      location: { select: { name: true, address: true } },
      course: {
        select: {
          id: true, slug: true, title: true, level: true, kind: true,
          ageMin: true, ageMax: true, price: true, sortOrder: true,
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  const closed = new Map<string, ScheduleProgram>()
  for (const g of groups) {
    const lastDay = g.dateEnd ?? g.dateStart
    if (isRadionica(g.course.kind) && lastDay && lastDay < today) continue
    let program = closed.get(g.course.id)
    if (!program) {
      const { sortOrder, ...course } = g.course
      sortOrders.set(course.id, sortOrder)
      program = { ...course, groups: [] }
      closed.set(course.id, program)
    }
    program.groups.push({
      id: g.id,
      name: g.name,
      dayOfWeek: g.dayOfWeek,
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      startTime: g.startTime,
      endTime: g.endTime,
      availableSpots: null,
      isFull: false,
      locationName: g.location.name,
      locationAddress: g.location.address,
    })
  }
  if (closed.size === 0) return open

  // One list in catalog order, so a same-time tie reads the same whichever
  // half a program came from.
  return [...open, ...closed.values()].sort(
    (a, b) => (sortOrders.get(a.id) ?? 0) - (sortOrders.get(b.id) ?? 0),
  )
}

/**
 * One program by slug, for its own signup link (`/prijava/<slug>`). Returns null
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
 * This city's saved razred→program overrides, keyed by course id — what
 * `programsForSelection` and `isTerminRequired` narrow with.
 *
 * A program absent from the result follows the built-in ladder in
 * `inquiry-availability.ts`, so an untouched city (Split) behaves exactly as it
 * did before this table existed.
 *
 * Each program's rule is read for the year its OWN open window names, not for
 * `computeSchoolYear()`: upisi for the next school year open during the summer,
 * while today's date still names the year that is ending, so "today's year"
 * would quietly ignore the setup the admin did under the year they are actually
 * enrolling for. Same open-window set `loadPrograms` gates groups on, so a rule
 * and the termini it narrows always belong to one school year.
 *
 * Deliberately a separate query rather than part of the feed: `loadPrograms` is
 * shared by three surfaces that all bypass the razred rule, and only `/prijava`
 * needs this.
 */
export async function getCourseGradeRules(city: City): Promise<CourseGradeRules> {
  const now = new Date()
  const openWindows = await db.courseEnrollmentWindow.findMany({
    where: openWindowWhere(city, now),
    select: { courseId: true, schoolYear: true },
    // A program may have this year's and next year's windows open at once. Take
    // the earlier one's rule: that is the enrollment already under way.
    orderBy: { schoolYear: 'asc' },
  })
  if (openWindows.length === 0) return {}

  const rows = await db.courseGradeRule.findMany({
    where: {
      city,
      OR: openWindows.map((w) => ({ courseId: w.courseId, schoolYear: w.schoolYear })),
    },
    select: { courseId: true, schoolYear: true, grades: true },
  })

  const byCourse = new Map<string, Grade[]>()
  // One entry per course, resolved by its EARLIEST open year — even when that
  // year has no row: "no row" means the default ladder, and a later year's rule
  // must not reach across into an enrollment already under way.
  const resolved = new Set<string>()
  for (const w of openWindows) {
    if (resolved.has(w.courseId)) continue
    resolved.add(w.courseId)
    const row = rows.find((r) => r.courseId === w.courseId && r.schoolYear === w.schoolYear)
    if (row) byCourse.set(w.courseId, row.grades as Grade[])
  }
  return Object.fromEntries(byCourse)
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
