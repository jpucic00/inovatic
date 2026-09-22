import type { City, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeGroupCapacity, RESERVING_INQUIRY_WHERE } from '@/lib/group-capacity'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

// A plain module, not `'use server'`: every export of an action file is a
// callable endpoint, and these loaders take ids without any guard of their own.
// The admin actions in src/actions/admin/inquiry.ts are the guarded callers.

export type WaitlistGroupView = {
  id: string
  courseId: string
  courseTitle: string
  name: string | null
  schedule: string
  locationName: string
  availableSpots: number
  isFull: boolean
}

/**
 * Groups matching `where`, each with its live free-seat count — the same
 * `computeGroupCapacity` the public feed and the upit dialogs use, so the
 * lista čekanja can never call a group free that /prijava calls full.
 *
 * `excludeInquiryId` drops that upit's own reservation from the counts: the
 * waitlist dialog is about to release it, so counting it would understate the
 * very group the family is leaving.
 */
export async function loadWaitlistGroupViews(
  where: Prisma.ScheduledGroupWhereInput,
  excludeInquiryId?: string,
): Promise<WaitlistGroupView[]> {
  const groups = await db.scheduledGroup.findMany({
    where,
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          id: true,
          title: true,
          kind: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              // computeGroupCapacity narrows to the group's own year and city.
              schedules: {
                select: { id: true, schoolYear: true, city: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      enrollments: {
        select: { id: true, moduleEnrollments: { select: { moduleScheduleId: true } } },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: excludeInquiryId
              ? { ...RESERVING_INQUIRY_WHERE, id: { not: excludeInquiryId } }
              : RESERVING_INQUIRY_WHERE,
          },
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  // One holiday query per (year, city), never per group.
  const holidayKeys = new Map<string, Set<string>>()
  for (const g of groups) {
    const key = `${g.schoolYear}::${g.city}`
    if (!holidayKeys.has(key)) {
      holidayKeys.set(key, await loadHolidayDateKeys(g.schoolYear, g.city))
    }
  }

  const now = new Date()
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(
      g,
      holidayKeys.get(`${g.schoolYear}::${g.city}`) ?? new Set(),
      now,
    )
    return {
      id: g.id,
      courseId: g.course.id,
      courseTitle: g.course.title,
      name: g.name,
      schedule: formatGroupSchedule({
        dateRange: isRadionica(g.course.kind),
        dayOfWeek: g.dayOfWeek,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        startTime: g.startTime,
        endTime: g.endTime,
      }),
      locationName: g.location.name,
      availableSpots,
      isFull,
    }
  })
}

/**
 * 1-based queue position of every waitlisted upit in (city, schoolYear),
 * oldest first. Computed over the whole queue rather than a filtered page, so a
 * family is #3 whatever the admin happens to be searching for.
 */
export async function loadWaitlistPositions(
  city: City,
  schoolYear: string | null,
): Promise<Map<string, number>> {
  const rows = await db.inquiry.findMany({
    where: { city, schoolYear, waitlistedAt: { not: null } },
    orderBy: [{ waitlistedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  return new Map(rows.map((r, i) => [r.id, i + 1]))
}
