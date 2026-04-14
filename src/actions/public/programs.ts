'use server'

import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'

export type ActiveGroup = {
  id: string
  name: string | null
  dayOfWeek: string | null
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

export async function getActivePrograms(): Promise<ActiveProgram[]> {
  const now = new Date()
  const year = computeSchoolYear()

  const groups = await db.scheduledGroup.findMany({
    where: {
      schoolYear: year,
      OR: [
        { enrollmentStart: null, enrollmentEnd: null },
        { enrollmentStart: { lte: now }, enrollmentEnd: { gte: now } },
        { enrollmentStart: { lte: now }, enrollmentEnd: null },
      ],
    },
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
                where: { schoolYear: year, endDate: { gte: now } },
                orderBy: { module: { sortOrder: 'asc' } },
                take: 1,
                select: {
                  id: true,
                  moduleEnrollments: {
                    where: { status: 'ACTIVE' },
                    select: { enrollmentId: true },
                  },
                },
              },
            },
          },
        },
      },
      enrollments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          moduleEnrollments: {
            where: { status: 'ACTIVE' },
            select: { moduleScheduleId: true },
          },
        },
      },
      _count: {
        select: {
          preferredInquiries: { where: { status: { notIn: ['DECLINED', 'ACCOUNT_CREATED'] } } },
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  const courseMap = new Map<string, ActiveProgram>()
  for (const g of groups) {
    const isStandard = !g.course.isCustom

    // Find the first module that has a schedule with endDate >= now (enrolling module)
    let enrollingScheduleId: string | null = null
    let enrollingModuleTitle: string | null = null
    if (isStandard) {
      for (const mod of g.course.modules) {
        if (mod.schedules.length > 0) {
          enrollingScheduleId = mod.schedules[0].id
          enrollingModuleTitle = mod.title
          break
        }
      }
    }

    let enrolledCount: number
    if (isStandard && enrollingScheduleId) {
      enrolledCount = g.enrollments.filter((e) =>
        e.moduleEnrollments.some((me) => me.moduleScheduleId === enrollingScheduleId),
      ).length
    } else {
      enrolledCount = g.enrollments.length
    }

    const available = g.maxStudents - enrolledCount - g._count.preferredInquiries
    const isFull = available <= 0

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

    courseMap.get(g.courseId)!.groups.push({
      id: g.id,
      name: g.name,
      dayOfWeek: g.dayOfWeek,
      startTime: g.startTime,
      endTime: g.endTime,
      availableSpots: Math.max(0, available),
      isFull,
      ...(enrollingModuleTitle ? { currentModuleName: enrollingModuleTitle } : {}),
    })
  }

  return Array.from(courseMap.values())
}
