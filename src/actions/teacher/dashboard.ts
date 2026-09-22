'use server'

import type { ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import { teacherGroupAccessWhere } from '@/lib/teacher-guard'
import { staffChangeAccessFrom, type StaffRole } from '@/lib/session-staff'
import { toDateKey } from '@/lib/session-dates'

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
  /** The caller's regular role on this group; null when not regular staff. */
  myRole: StaffRole | null
  /**
   * Upcoming termini (YYYY-MM-DD) an admin put the caller on as a one-off
   * change. A group reached ONLY through these drops off the list the day
   * after its last one.
   */
  myChangeDates: string[]
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
      : teacherGroupAccessWhere(session.user.id),
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
      teacherAssignments: {
        where: { userId: session.user.id },
        select: { role: true },
      },
      sessionStaffChanges: {
        where: {
          userId: session.user.id,
          sessionDate: { gte: staffChangeAccessFrom(new Date()) },
        },
        orderBy: { sessionDate: 'asc' },
        select: { sessionDate: true },
      },
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
    myRole: g.teacherAssignments[0]?.role ?? null,
    myChangeDates: g.sessionStaffChanges.map((c) => toDateKey(c.sessionDate)),
  }))
}
