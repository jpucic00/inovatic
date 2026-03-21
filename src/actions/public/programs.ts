'use server'

import { db } from '@/lib/db'

export type ActiveGroup = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  availableSpots: number
  isFull: boolean
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

  const groups = await db.scheduledGroup.findMany({
    where: {
      isActive: true,
      OR: [
        // No enrollment window = always open (follows course.isActive)
        { enrollmentStart: null, enrollmentEnd: null },
        // Within enrollment window
        { enrollmentStart: { lte: now }, enrollmentEnd: { gte: now } },
        // Started but no end date
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
          isActive: true,
          ageMin: true,
          ageMax: true,
          price: true,
          sortOrder: true,
        },
      },
      _count: {
        select: {
          enrollments: { where: { status: 'ACTIVE' } },
          preferredInquiries: { where: { status: { not: 'DECLINED' } } },
        },
      },
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  })

  // Filter: only active courses (radionice show regardless of enrollment window)
  const filteredGroups = groups.filter((g) => g.course.isActive)

  // Group by course — include full groups (marked isFull) so they show disabled
  const courseMap = new Map<string, ActiveProgram>()
  for (const g of filteredGroups) {
    const available = g.maxStudents - g._count.enrollments - g._count.preferredInquiries
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
    })
  }

  return Array.from(courseMap.values())
}
