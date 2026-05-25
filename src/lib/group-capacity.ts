import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeAvailableSpots } from '@/lib/available-spots'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
} from '@/lib/group-module-arc'
import { computeSchoolYear } from '@/lib/school-year'
import { toDateKey } from '@/lib/session-dates'

export class GroupFullError extends Error {
  constructor() {
    super('Group is full')
  }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

type GroupCapacityRow = {
  schoolYear: string
  dayOfWeek: string | null
  maxStudents: number
  enrollments: {
    id: string
    moduleEnrollments: { moduleScheduleId: string }[]
  }[]
  _count: { preferredInquiries: number }
  course: {
    isCustom: boolean
    modules: {
      id: string
      title: string
      sortOrder: number
      schedules: {
        id: string
        schoolYear: string
        startDate: Date | null
        endDate: Date | null
      }[]
    }[]
  }
}

interface GroupCapacityInfo {
  enrolledCount: number
  reservedInquiriesCount: number
  availableSpots: number
  isFull: boolean
  /**
   * Per-group next-enrolling module — the module a new enrollment would
   * target. Null for radionice (no modules) or when the arc has run out of
   * future modules (graduated, or schedule incomplete past this point).
   */
  nextEnrollingModule: {
    moduleId: string
    moduleScheduleId: string
    title: string
  } | null
}

/**
 * Remaining-spots view of a `ScheduledGroup`.
 *
 * Standard course: `enrolledCount` only counts enrollments tied to the
 * **per-group next-enrolling module** — `getGroupModuleArc` race-ahead from
 * the group's school-year kickoff using its weekday + the holiday set. Two
 * groups in the same course on different weekdays can have different next
 * modules (Mon group still on M1, Wed group already on M2), so capacity is
 * counted against each group's own next-not-yet-started module.
 *
 * When the arc has no future module — graduated past M4, or schedule
 * incomplete — we fall back to `enrollments.length` (lifetime total). This
 * is intentionally conservative (cannot over-book) but is not a meaningful
 * "open enrollment" signal; `toActiveGroup` pre-filters such groups out of
 * the public inquiry form. Admin loaders return them on purpose so admins
 * can still review/manage.
 *
 * Custom course (radionica): `enrolledCount = enrollments.length`.
 */
export function computeGroupCapacity(
  group: GroupCapacityRow,
  holidayDates: ReadonlySet<string>,
  now: Date = new Date(),
): GroupCapacityInfo {
  let enrolledCount: number
  let nextEnrollingModule: GroupCapacityInfo['nextEnrollingModule'] = null

  if (group.course.isCustom) {
    enrolledCount = group.enrollments.length
  } else {
    const arc = getGroupModuleArc({
      dayOfWeek: group.dayOfWeek,
      modules: group.course.modules.map((m) => {
        const schedule = m.schedules.find(
          (s) => s.schoolYear === group.schoolYear,
        )
        return {
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          schedule:
            schedule && schedule.startDate && schedule.endDate
              ? {
                  id: schedule.id,
                  startDate: schedule.startDate,
                  endDate: schedule.endDate,
                }
              : null,
        }
      }),
      holidayDates,
    })
    const next = getActiveModuleForGroup(arc, now).nextEnrollingModule
    if (next) {
      nextEnrollingModule = {
        moduleId: next.moduleId,
        moduleScheduleId: next.moduleScheduleId,
        title: next.moduleTitle,
      }
      enrolledCount = group.enrollments.filter((e) =>
        e.moduleEnrollments.some(
          (me) => me.moduleScheduleId === next.moduleScheduleId,
        ),
      ).length
    } else {
      enrolledCount = group.enrollments.length
    }
  }

  const reservedInquiriesCount = group._count.preferredInquiries
  const availableSpots = computeAvailableSpots(
    group.maxStudents,
    enrolledCount + reservedInquiriesCount,
  )
  return {
    enrolledCount,
    reservedInquiriesCount,
    availableSpots,
    isFull: availableSpots === 0,
    nextEnrollingModule,
  }
}

export async function assertGroupHasAvailableSpot(
  tx: TxClient,
  scheduledGroupId: string,
): Promise<void> {
  const group = await tx.scheduledGroup.findUnique({
    where: { id: scheduledGroupId },
    select: {
      schoolYear: true,
      dayOfWeek: true,
      maxStudents: true,
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: { notIn: ['DECLINED', 'ACCOUNT_CREATED'] } },
          },
        },
      },
      course: {
        select: {
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                // Intentionally broader than computeGroupCapacity needs:
                // Prisma sub-selects cannot correlate against the parent
                // row's group.schoolYear, so we fetch current-or-future
                // schedules here and let computeGroupCapacity below narrow
                // to s.schoolYear === group.schoolYear. The gte floor
                // slides forward each Sept (past years drop out
                // automatically), so this set stays bounded — 1 current
                // schoolYear plus at most 1 future per project policy.
                // Same pattern as getActivePrograms → toActiveGroup.
                where: { schoolYear: { gte: computeSchoolYear() } },
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
    },
  })

  if (!group) throw new GroupFullError()
  // Load holidays INSIDE the same transaction so the arc/capacity decision
  // sees a consistent snapshot under Serializable isolation. Holidays for
  // standard courses only — radionice short-circuit before arc computation
  // so the empty-set fast-path is fine for them.
  const holidayRows = group.course.isCustom
    ? []
    : await tx.schoolYearHoliday.findMany({
        where: { schoolYear: group.schoolYear },
        select: { date: true },
      })
  const holidayDates = new Set(holidayRows.map((r) => toDateKey(r.date)))
  if (computeGroupCapacity(group, holidayDates).isFull) throw new GroupFullError()
}

// Single retry on P2034 is sufficient at the project's current write volume
// (low single-digit concurrent admin writes + public form bursts) — Postgres
// serialization conflicts on Inquiry/Enrollment hot rows resolve in one
// re-roll. If a P2034 ever surfaces in production logs after retry, bump this
// to N attempts with exponential backoff.
export async function runWithGroupCapacityGuard<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const runTx = () => db.$transaction(fn, { isolationLevel: 'Serializable' })
  try {
    return await runTx()
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2034'
    ) {
      return await runTx()
    }
    throw err
  }
}
