'use server'

import type { ProgramKind } from '@prisma/client'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth-guard'
import { classroomGroupWhere } from '@/lib/classroom-access'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { loadHolidayDateKeys } from '@/lib/holidays'

export type ClassroomProgram = {
  course: { id: string; title: string; kind: ProgramKind }
  groupCount: number
}

type ClassroomGroup = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  /** Radionice only — the cycle a teacher is picking between. */
  dateStart: string | null
  dateEnd: string | null
  location: { name: string }
  teacherNames: string[]
  activeModule: { id: string; title: string } | null
}

/**
 * The shared classroom login only. A child's session is sent back to its own
 * dashboard — the reads below have no notion of enrollment and would otherwise
 * list every group in the city.
 */
async function requireClassroom() {
  const session = await requirePortalUser()
  if (session.user.role !== 'CLASSROOM') redirect('/portal')
  return session
}

/**
 * Step one on a classroom PC: which programs run in this city this school year.
 * Groups, not courses, are the source — a program with no current-year group
 * here is not offered, and the count tells the teacher what step two holds.
 */
export async function getClassroomPrograms(): Promise<ClassroomProgram[]> {
  const session = await requireClassroom()

  const groups = await db.scheduledGroup.findMany({
    where: classroomGroupWhere(session.user.city),
    select: {
      course: { select: { id: true, title: true, kind: true, sortOrder: true } },
    },
  })

  const byCourse = new Map<string, { program: ClassroomProgram; sortOrder: number }>()
  for (const g of groups) {
    const entry = byCourse.get(g.course.id)
    if (entry) {
      entry.program.groupCount += 1
    } else {
      byCourse.set(g.course.id, {
        program: {
          course: { id: g.course.id, title: g.course.title, kind: g.course.kind },
          groupCount: 1,
        },
        sortOrder: g.course.sortOrder,
      })
    }
  }

  return [...byCourse.values()]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.program.course.title.localeCompare(b.program.course.title, 'hr'),
    )
    .map((entry) => entry.program)
}

/**
 * Step two: the program's current-year groups in this city. A program that has
 * none here (or an id from another city) gives an empty list, not an error —
 * the page says so and offers the way back.
 */
export async function getClassroomGroups(
  courseId: string,
): Promise<{ course: { id: string; title: string; kind: ProgramKind } | null; groups: ClassroomGroup[] }> {
  const session = await requireClassroom()
  const city = session.user.city

  const course = await db.course.findFirst({
    where: { id: courseId, OR: [{ city: null }, { city }] },
    select: { id: true, title: true, kind: true },
  })
  if (!course) return { course: null, groups: [] }

  const groups = await db.scheduledGroup.findMany({
    where: { ...classroomGroupWhere(city), courseId },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    include: {
      course: {
        include: { modules: { orderBy: { sortOrder: 'asc' }, include: { schedules: true } } },
      },
      location: { select: { name: true } },
      teacherAssignments: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })

  const holidaysByYear = new Map<string, Set<string>>()
  for (const g of groups) {
    if (!holidaysByYear.has(g.schoolYear)) {
      holidaysByYear.set(g.schoolYear, await loadHolidayDateKeys(g.schoolYear, city))
    }
  }

  return {
    course,
    groups: groups.map((g) => {
      const activeModule = getCurrentActiveModuleForGroup({
        dayOfWeek: g.dayOfWeek,
        modules: g.course.modules,
        schoolYear: g.schoolYear,
        city,
        kind: g.course.kind,
        holidayDates: holidaysByYear.get(g.schoolYear) ?? new Set(),
      })
      return {
        id: g.id,
        name: g.name,
        dayOfWeek: g.dayOfWeek,
        startTime: g.startTime,
        endTime: g.endTime,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        location: { name: g.location.name },
        teacherNames: g.teacherAssignments.map((t) => `${t.user.firstName} ${t.user.lastName}`),
        activeModule: activeModule ? { id: activeModule.id, title: activeModule.title } : null,
      }
    }),
  }
}
