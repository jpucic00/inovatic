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
  const yearFloor = computeSchoolYear()

  const groups = await db.scheduledGroup.findMany({
    where: {
      AND: [
        {
          OR: [
            { enrollmentStart: null },
            { enrollmentStart: { lte: now } },
          ],
        },
        {
          OR: [
            { enrollmentEnd: null },
            { enrollmentEnd: { gte: now } },
          ],
        },
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
                where: { schoolYear: { gte: yearFloor } },
                select: {
                  id: true,
                  schoolYear: true,
                  startDate: true,
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
          preferredInquiries: { where: { status: { notIn: ['DECLINED', 'ACCOUNT_CREATED'] } } },
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  const courseMap = new Map<string, ActiveProgram>()
  for (const g of groups) {
    const isStandard = !g.course.isCustom

    let enrollingScheduleId: string | null = null
    let enrollingModuleTitle: string | null = null
    if (isStandard) {
      for (const mod of g.course.modules) {
        const schedule = mod.schedules.find(
          (s) => s.schoolYear === g.schoolYear && s.startDate !== null && s.startDate > now,
        )
        if (schedule) {
          enrollingScheduleId = schedule.id
          enrollingModuleTitle = mod.title
          break
        }
      }
      if (!enrollingScheduleId) continue
    }

    const enrolledCount = isStandard
      ? g.enrollments.filter((e) =>
          e.moduleEnrollments.some((me) => me.moduleScheduleId === enrollingScheduleId),
        ).length
      : g.enrollments.length

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
