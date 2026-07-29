import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

// Server actions revalidate after success — stub the next/cache + next/headers
// integrations so the action body runs without a request scope.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined
        ? { value, name }
        : undefined,
  })
}

const SY = '2026/2027'
const TEST_HOLIDAY = new Date(Date.UTC(2026, 6, 17))

// Scoped teardown: this file seeds groups, enrollments and teacher assignments
// that FK-block a course wipe, so it takes exactly those rows with it. Naming
// its own ids (rather than emptying the tables) keeps a failure here from
// landing on whichever file happens to run next.
const fx = fixtureScope()

beforeAll(async () => {
  setSelectedYearCookie(SY)
  // getSelectedSchoolYear only honours the cookie when the year is registered;
  // register it so this file is self-contained (doesn't rely on another file
  // leaving a SchoolYear row behind).
  await db.schoolYear.upsert({
    where: { label: SY },
    create: { label: SY },
    update: {},
  })
})

afterAll(async () => {
  await fx.cleanup()
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY, date: TEST_HOLIDAY } })
})

const { createGroup: createGroupAction, updateGroup, getGroupDetail } =
  await import('@/actions/admin/group')
const { getGroupAttendance } = await import('@/actions/teacher/attendance')

describe('createGroup — radionica date range', () => {
  it('persists dateStart + dateEnd and leaves dayOfWeek null when admin creates a radionica', async () => {
    const admin = await createAdmin()
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const location = await fx.location()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createGroupAction({
      courseId: radionica.id,
      locationId: location.id,
      name: 'Ljetna robotika 2026',
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
      dayOfWeek: '',
      startTime: '09:00',
      endTime: '11:00',
      maxStudents: 12,
    })
    expect(res.success).toBe(true)

    const created = fx.trackGroup(
      await db.scheduledGroup.findFirstOrThrow({
        where: { name: 'Ljetna robotika 2026' },
      }),
    )
    expect(created.dateStart).toBe('2026-07-15')
    expect(created.dateEnd).toBe('2026-07-21')
    expect(created.dayOfWeek).toBeNull()
  })

  it('rejects a radionica when only dateStart is provided', async () => {
    const admin = await createAdmin()
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const location = await fx.location()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createGroupAction({
      courseId: radionica.id,
      locationId: location.id,
      name: 'Half-formed',
      dateStart: '2026-07-15',
      dateEnd: '',
      dayOfWeek: '',
      startTime: '09:00',
      endTime: '11:00',
      maxStudents: 12,
    })
    expect(res.success).toBe(false)
  })

  it('rejects a radionica when dateEnd is before dateStart', async () => {
    const admin = await createAdmin()
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const location = await fx.location()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createGroupAction({
      courseId: radionica.id,
      locationId: location.id,
      name: 'Backwards',
      dateStart: '2026-07-21',
      dateEnd: '2026-07-15',
      dayOfWeek: '',
      startTime: '09:00',
      endTime: '11:00',
      maxStudents: 12,
    })
    expect(res.success).toBe(false)
  })

  it('allows updateGroup to widen the date range', async () => {
    const admin = await createAdmin()
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const group = await fx.group({
      courseId: radionica.id,
      schoolYear: '2026/2027',
      dateStart: '2026-07-15',
      dateEnd: '2026-07-15',
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await updateGroup({
      id: group.id,
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
    })
    expect(res.success).toBe(true)

    const updated = await getGroupDetail(group.id)
    expect(updated?.dateStart).toBe('2026-07-15')
    expect(updated?.dateEnd).toBe('2026-07-21')
  })
})

describe('getGroupAttendance — radionica session enumeration', () => {
  it('returns one expected session per day in the radionica range (skipping holidays + Sundays)', async () => {
    const teacher = await createTeacher()
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    // 2026-07-15..19: Wed Thu Fri Sat Sun. Sunday (19th) drops out automatically;
    // we also mark the 17th as a holiday — only Wed/Thu/Sat remain.
    const group = await fx.group({
      courseId: radionica.id,
      schoolYear: '2026/2027',
      dateStart: '2026-07-15',
      dateEnd: '2026-07-19',
    })
    await createTeacherAssignment(teacher.id, group.id)
    // One enrollment so the roster has a row (not strictly needed for expected-sessions math).
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: '2026/2027' })
    await db.schoolYearHoliday.create({
      data: {
        city: 'SPLIT',
        schoolYear: SY,
        date: TEST_HOLIDAY,
        name: 'Test holiday',
      },
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const data = await getGroupAttendance(group.id)
    if (data.kind !== 'custom') throw new Error('expected custom kind')
    expect(data.dateStart).toBe('2026-07-15')
    expect(data.dateEnd).toBe('2026-07-19')
    expect(data.expectedSessions).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-18',
    ])
  })

  it('standard programs keep their dayOfWeek-driven weekly enumeration', async () => {
    const teacher = await createTeacher()
    const standard = await fx.course({ kind: 'STANDARD' })
    const group = await fx.group({
      courseId: standard.id,
      schoolYear: '2026/2027',
      dayOfWeek: 'Ponedjeljak',
    })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const data = await getGroupAttendance(group.id)
    if (data.kind !== 'standard') throw new Error('expected standard kind')
    expect(data.dateStart).toBeNull()
    expect(data.dateEnd).toBeNull()
    // No course modules → no sections, but the action shouldn't throw.
    expect(data.sections).toEqual([])
    expect(data.otherDates).toEqual([])
  })
})
