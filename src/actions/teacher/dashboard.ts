'use server'

import type { ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'

export type TeacherGroupSummary = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  course: { id: string; title: string; kind: ProgramKind }
  location: { id: string; name: string }
  enrollmentCount: number
  materialCount: number
}

/**
 * Returns every group visible to the logged-in user, ALL school years — the
 * dashboard tabs by year and needs the past ones to build the tab list.
 * TEACHER users see only groups they have a TeacherAssignment for.
 * ADMIN users see every group of THEIR CITY — the tenant-bound pass-through
 * that makes /nastavnik show Slavica exactly her Šibenik groups.
 */
export async function getMyAssignedGroups(): Promise<TeacherGroupSummary[]> {
  const session = await requireTeacher()
  const isAdmin = session.user.role === 'ADMIN'

  const groups = await db.scheduledGroup.findMany({
    where: isAdmin
      ? { city: session.user.city }
      : { teacherAssignments: { some: { userId: session.user.id } } },
    orderBy: [
      { schoolYear: 'desc' },
      { course: { sortOrder: 'asc' } },
      { name: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      course: { select: { id: true, title: true, kind: true } },
      location: { select: { id: true, name: true } },
      _count: { select: { enrollments: true, materials: true } },
    },
  })

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    dayOfWeek: g.dayOfWeek,
    startTime: g.startTime,
    endTime: g.endTime,
    schoolYear: g.schoolYear,
    course: g.course,
    location: g.location,
    enrollmentCount: g._count.enrollments,
    materialCount: g._count.materials,
  }))
}
