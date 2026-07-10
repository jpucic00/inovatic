import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createLocation,
  createModule,
  createEnrollment,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { value, name } : undefined,
  })
}

beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

beforeEach(() => {
  setSelectedYearCookie('2026/2027')
})

const SY = '2026/2027'

// Module windows mirror the planner output for a 2026-09-01 kickoff with no
// holidays — Mon as the slowest weekday by convention so its 7th session
// anchors each module's endDate.
const MODULE_WINDOWS = [
  { startDate: new Date(Date.UTC(2026, 8, 1)), endDate: new Date(Date.UTC(2026, 9, 19)) }, // M1: 01.09 – 19.10
  { startDate: new Date(Date.UTC(2026, 9, 20)), endDate: new Date(Date.UTC(2026, 11, 7)) }, // M2: 20.10 – 07.12
  { startDate: new Date(Date.UTC(2026, 11, 8)), endDate: new Date(Date.UTC(2027, 0, 25)) }, // M3: 08.12 – 25.01
  { startDate: new Date(Date.UTC(2027, 0, 26)), endDate: new Date(Date.UTC(2027, 2, 15)) }, // M4: 26.01 – 15.03
] as const

async function seedStandardCourseWithFourModules() {
  const location = await createLocation()
  const course = await createCourse({ isCustom: false, title: 'SLR 1' })
  const modules = await Promise.all(
    MODULE_WINDOWS.map((_, i) =>
      createModule(course.id, { sortOrder: i, title: `Modul ${i + 1}` }),
    ),
  )
  const schedules = await Promise.all(
    modules.map((mod, i) =>
      db.moduleSchedule.create({
        data: {
          city: 'SPLIT',
          moduleId: mod.id,
          schoolYear: SY,
          startDate: MODULE_WINDOWS[i].startDate,
          endDate: MODULE_WINDOWS[i].endDate,
        },
      }),
    ),
  )
  return { course, location, modules, schedules }
}

describe('per-group active module — capacity diverges by weekday + holidays', () => {
  it('Mon (2 holidays in M1) and Wed (no holidays) have different next-enrolling modules on the same date', async () => {
    const admin = await createAdmin()
    await db.schoolYear.upsert({
      where: { label: SY },
      create: { label: SY },
      update: {},
    })
    const { course, location, schedules } = await seedStandardCourseWithFourModules()

    const wedGroup = await createGroup({
      courseId: course.id,
      locationId: location.id,
      dayOfWeek: 'Srijeda',
      schoolYear: SY,
      maxStudents: 8,
    })
    const monGroup = await createGroup({
      courseId: course.id,
      locationId: location.id,
      dayOfWeek: 'Ponedjeljak',
      schoolYear: SY,
      maxStudents: 8,
    })

    // Two Mon holidays inside M1 — slow Mon arc down 2 weeks.
    await db.schoolYearHoliday.createMany({
      data: [
        { city: 'SPLIT', schoolYear: SY, date: new Date(Date.UTC(2026, 8, 21)) }, // Mon 21.09
        { city: 'SPLIT', schoolYear: SY, date: new Date(Date.UTC(2026, 9, 5)) }, // Mon 05.10
      ],
    })

    // Enroll students into specific modules so the capacity count differs by
    // which moduleScheduleId we're asking about.
    const wedStudent = await createStudent()
    const monStudent = await createStudent()
    const wedEnrollment = await createEnrollment(wedStudent.id, wedGroup.id, {
      schoolYear: SY,
    })
    const monEnrollment = await createEnrollment(monStudent.id, monGroup.id, {
      schoolYear: SY,
    })
    // wedStudent enrolled in M2 schedule, monStudent enrolled in M2 schedule.
    await db.moduleEnrollment.create({
      data: { enrollmentId: wedEnrollment.id, moduleScheduleId: schedules[1].id },
    })
    await db.moduleEnrollment.create({
      data: { enrollmentId: monEnrollment.id, moduleScheduleId: schedules[1].id },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const { getGroupsForCourseInSelectedYear } = await import(
      '@/actions/admin/inquiry'
    )
    const groups = await getGroupsForCourseInSelectedYear(course.id)

    const wedRow = groups.find((g) => g.id === wedGroup.id)
    const monRow = groups.find((g) => g.id === monGroup.id)
    expect(wedRow).toBeDefined()
    expect(monRow).toBeDefined()
    // Both groups exposed by the admin endpoint regardless of "next enrolling"
    // (admin sees full roster) — what matters is the spots count differs.
    // To assert per-group truth, hit computeGroupCapacity directly with the
    // same shape the action would produce.
    const { computeGroupCapacity } = await import('@/lib/group-capacity')
    const { loadHolidayDateKeys } = await import('@/lib/holidays')
    const holidayDates = await loadHolidayDateKeys(SY)
    const asOf = new Date(Date.UTC(2026, 10, 4)) // 04.11.2026

    const reload = async (groupId: string) =>
      db.scheduledGroup.findUnique({
        where: { id: groupId },
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
                    where: { schoolYear: SY },
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

    const wedShape = await reload(wedGroup.id)
    const monShape = await reload(monGroup.id)
    if (!wedShape || !monShape) throw new Error('group reload failed')

    const wedCap = computeGroupCapacity(wedShape, holidayDates, asOf)
    const monCap = computeGroupCapacity(monShape, holidayDates, asOf)

    // On 04.11.2026, Wed has finished M1 (last 14.10) and started M2 (first
    // 21.10) — next-enrolling is M3.
    expect(wedCap.nextEnrollingModule?.moduleScheduleId).toBe(schedules[2].id)
    // Mon is still on M1 because of the two Mon holidays — next-enrolling is M2.
    expect(monCap.nextEnrollingModule?.moduleScheduleId).toBe(schedules[1].id)
    // Spot count reflects the per-group next module's roster:
    // Mon's M2 enrollment count = 1 (monEnrollment), Wed's M3 = 0.
    expect(monCap.enrolledCount).toBe(1)
    expect(wedCap.enrolledCount).toBe(0)
  })
})
