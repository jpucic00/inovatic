import { describe, expect, it } from 'vitest'
import { computeGroupCapacity } from '@/lib/group-capacity'

type GroupCapacityRow = Parameters<typeof computeGroupCapacity>[0]

const SCHOOL_YEAR = '2026/2027'
const NOW = new Date('2026-10-15T12:00:00Z')

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

type ScheduleFixture = {
  id: string
  schoolYear?: string
  startDate: Date | null
}

const mkModule = (schedules: ScheduleFixture[]) => ({
  schedules: schedules.map((s) => ({
    id: s.id,
    schoolYear: s.schoolYear ?? SCHOOL_YEAR,
    startDate: s.startDate,
  })),
})

const mkEnrollment = (id: string, moduleScheduleIds: string[]) => ({
  id,
  moduleEnrollments: moduleScheduleIds.map((moduleScheduleId) => ({ moduleScheduleId })),
})

const mkGroup = (input: {
  maxStudents: number
  isCustom: boolean
  modules: ReturnType<typeof mkModule>[]
  enrollments: ReturnType<typeof mkEnrollment>[]
  reservedInquiriesCount?: number
}): GroupCapacityRow => ({
  schoolYear: SCHOOL_YEAR,
  maxStudents: input.maxStudents,
  enrollments: input.enrollments,
  _count: { preferredInquiries: input.reservedInquiriesCount ?? 0 },
  course: {
    isCustom: input.isCustom,
    modules: input.modules,
  },
})

describe('computeGroupCapacity — fallback when no upcoming module schedule', () => {
  it('standard course with all past schedules: enrolledCount equals lifetime enrollments', () => {
    const group = mkGroup({
      maxStudents: 12,
      isCustom: false,
      modules: [
        mkModule([{ id: 's-past-1', startDate: utc(2026, 9, 1) }]),
        mkModule([{ id: 's-past-2', startDate: utc(2026, 10, 1) }]),
      ],
      enrollments: [
        mkEnrollment('e1', ['s-past-1']),
        mkEnrollment('e2', ['s-past-1']),
        mkEnrollment('e3', ['s-past-2']),
        mkEnrollment('e4', ['s-past-2']),
        mkEnrollment('e5', []),
      ],
      reservedInquiriesCount: 1,
    })

    const cap = computeGroupCapacity(group, NOW)
    expect(cap.enrolledCount).toBe(5)
    expect(cap.reservedInquiriesCount).toBe(1)
    expect(cap.availableSpots).toBe(6)
    expect(cap.isFull).toBe(false)
  })

  it('standard course with no modules at all: fallback fires defensively', () => {
    const group = mkGroup({
      maxStudents: 10,
      isCustom: false,
      modules: [],
      enrollments: [mkEnrollment('e1', []), mkEnrollment('e2', [])],
    })

    const cap = computeGroupCapacity(group, NOW)
    expect(cap.enrolledCount).toBe(2)
    expect(cap.availableSpots).toBe(8)
    expect(cap.isFull).toBe(false)
  })

  it('sanity contrast: standard course with a future schedule narrows by moduleScheduleId (fallback does NOT fire)', () => {
    const group = mkGroup({
      maxStudents: 8,
      isCustom: false,
      modules: [
        mkModule([{ id: 's-past', startDate: utc(2026, 9, 1) }]),
        mkModule([{ id: 's-future', startDate: utc(2026, 11, 1) }]),
      ],
      enrollments: [
        mkEnrollment('e1', ['s-past']),
        mkEnrollment('e2', ['s-past']),
        mkEnrollment('e3', ['s-future']),
      ],
    })

    const cap = computeGroupCapacity(group, NOW)
    expect(cap.enrolledCount).toBe(1)
    expect(cap.availableSpots).toBe(7)
    expect(cap.isFull).toBe(false)
  })
})
