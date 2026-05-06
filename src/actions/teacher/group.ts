'use server'

import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { computeSchoolYear } from '@/lib/school-year'

export type TeacherGroupDetail = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  course: {
    id: string
    title: string
    isCustom: boolean
    modules: {
      id: string
      title: string
      sortOrder: number
      schedule: { startDate: Date | null; endDate: Date | null } | null
    }[]
  }
  location: { id: string; name: string }
  teacherNames: string[]
}

export type RosterRow = {
  enrollmentId: string
  studentId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  childSchool: string | null
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
}

export async function getTeacherGroupDetail(groupId: string): Promise<TeacherGroupDetail> {
  await assertTeacherOwnsGroup(groupId)
  const schoolYear = computeSchoolYear()

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: { schedules: { where: { schoolYear } } },
          },
        },
      },
      location: true,
      teacherAssignments: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })

  return {
    id: group.id,
    name: group.name,
    dayOfWeek: group.dayOfWeek,
    startTime: group.startTime,
    endTime: group.endTime,
    schoolYear: group.schoolYear,
    course: {
      id: group.course.id,
      title: group.course.title,
      isCustom: group.course.isCustom,
      modules: group.course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        schedule: m.schedules[0]
          ? { startDate: m.schedules[0].startDate, endDate: m.schedules[0].endDate }
          : null,
      })),
    },
    location: { id: group.location.id, name: group.location.name },
    teacherNames: group.teacherAssignments.map(
      (t) => `${t.user.firstName} ${t.user.lastName}`,
    ),
  }
}

export async function getGroupRoster(groupId: string): Promise<RosterRow[]> {
  await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { schoolYear: true },
  })

  const enrollments = await db.enrollment.findMany({
    where: { scheduledGroupId: groupId, schoolYear: group.schoolYear },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          childSchool: true,
          parentName: true,
          parentEmail: true,
          parentPhone: true,
        },
      },
    },
  })

  return enrollments.map((e) => ({
    enrollmentId: e.id,
    studentId: e.user.id,
    firstName: e.user.firstName,
    lastName: e.user.lastName,
    dateOfBirth: e.user.dateOfBirth,
    childSchool: e.user.childSchool,
    parentName: e.user.parentName,
    parentEmail: e.user.parentEmail,
    parentPhone: e.user.parentPhone,
  }))
}
