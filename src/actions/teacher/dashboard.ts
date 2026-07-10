'use server'

import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import { computeSchoolYear } from '@/lib/school-year'

type TeacherGroupSummary = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  course: { id: string; title: string; isCustom: boolean }
  location: { id: string; name: string }
  enrollmentCount: number
  materialCount: number
}

/**
 * Returns the current school year's groups visible to the logged-in user.
 * TEACHER users see only groups they have a TeacherAssignment for.
 * ADMIN users see every group of THEIR CITY in the current school year — the
 * tenant-bound pass-through that makes /nastavnik show Slavica exactly her
 * Šibenik groups.
 */
export async function getMyAssignedGroups(): Promise<TeacherGroupSummary[]> {
  const session = await requireTeacher()
  const schoolYear = computeSchoolYear()
  const isAdmin = session.user.role === 'ADMIN'

  const groups = await db.scheduledGroup.findMany({
    where: {
      schoolYear,
      ...(isAdmin
        ? { city: session.user.city }
        : { teacherAssignments: { some: { userId: session.user.id } } }),
    },
    orderBy: [{ course: { sortOrder: 'asc' } }, { name: 'asc' }, { createdAt: 'asc' }],
    include: {
      course: { select: { id: true, title: true, isCustom: true } },
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
