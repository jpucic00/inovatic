import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeAvailableSpots } from '@/lib/available-spots'
import { computeSchoolYear } from '@/lib/school-year'

export class GroupFullError extends Error {
  constructor() {
    super('Group is full')
  }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

type GroupCapacityRow = {
  schoolYear: string
  maxStudents: number
  enrollments: {
    id: string
    moduleEnrollments: { moduleScheduleId: string }[]
  }[]
  _count: { preferredInquiries: number }
  course: {
    isCustom: boolean
    modules: {
      schedules: { id: string; schoolYear: string; startDate: Date | null }[]
    }[]
  }
}

interface GroupCapacityInfo {
  enrolledCount: number
  reservedInquiriesCount: number
  availableSpots: number
  isFull: boolean
}

export function computeGroupCapacity(
  group: GroupCapacityRow,
  now: Date = new Date(),
): GroupCapacityInfo {
  let enrolledCount: number

  if (group.course.isCustom) {
    enrolledCount = group.enrollments.length
  } else {
    let enrollingScheduleId: string | null = null
    for (const mod of group.course.modules) {
      const schedule = mod.schedules.find(
        (s) =>
          s.schoolYear === group.schoolYear &&
          s.startDate !== null &&
          s.startDate > now,
      )
      if (schedule) {
        enrollingScheduleId = schedule.id
        break
      }
    }
    enrolledCount = enrollingScheduleId
      ? group.enrollments.filter((e) =>
          e.moduleEnrollments.some(
            (me) => me.moduleScheduleId === enrollingScheduleId,
          ),
        ).length
      : group.enrollments.length
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
              schedules: {
                where: { schoolYear: { gte: computeSchoolYear() } },
                select: { id: true, schoolYear: true, startDate: true },
              },
            },
          },
        },
      },
    },
  })

  if (!group) throw new GroupFullError()
  if (computeGroupCapacity(group).isFull) throw new GroupFullError()
}

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
