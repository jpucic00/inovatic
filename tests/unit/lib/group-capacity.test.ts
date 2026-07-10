import { describe, expect, it } from 'vitest'
import { computeGroupCapacity } from '@/lib/group-capacity'

type GroupCapacityRow = Parameters<typeof computeGroupCapacity>[0]

const SCHOOL_YEAR = '2026/2027'
const NOW = new Date(Date.UTC(2026, 9, 15)) // 15.10.2026

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

type ModuleFixture = {
  id: string
  title: string
  sortOrder: number
  scheduleId: string | null
  startDate: Date | null
  endDate: Date | null
}

const mkModule = (m: ModuleFixture) => ({
  id: m.id,
  title: m.title,
  sortOrder: m.sortOrder,
  schedules:
    m.scheduleId !== null
      ? [
          {
            id: m.scheduleId,
            schoolYear: SCHOOL_YEAR,
            city: 'SPLIT' as const,
            startDate: m.startDate,
            endDate: m.endDate,
          },
        ]
      : [],
})

const mkEnrollment = (id: string, moduleScheduleIds: string[]) => ({
  id,
  moduleEnrollments: moduleScheduleIds.map((moduleScheduleId) => ({
    moduleScheduleId,
  })),
})

const mkGroup = (input: {
  maxStudents: number
  isCustom: boolean
  dayOfWeek?: string | null
  modules: ReturnType<typeof mkModule>[]
  enrollments: ReturnType<typeof mkEnrollment>[]
  reservedInquiriesCount?: number
}): GroupCapacityRow => ({
  schoolYear: SCHOOL_YEAR,
  city: 'SPLIT',
  dayOfWeek: input.dayOfWeek ?? 'Srijeda',
  maxStudents: input.maxStudents,
  enrollments: input.enrollments,
  _count: { preferredInquiries: input.reservedInquiriesCount ?? 0 },
  course: {
    isCustom: input.isCustom,
    modules: input.modules,
  },
})

const STD_M1 = mkModule({
  id: 'mod-1',
  title: 'Modul 1',
  sortOrder: 0,
  scheduleId: 's1',
  startDate: utc(2026, 9, 1),
  endDate: utc(2026, 10, 19),
})
const STD_M2 = mkModule({
  id: 'mod-2',
  title: 'Modul 2',
  sortOrder: 1,
  scheduleId: 's2',
  startDate: utc(2026, 10, 20),
  endDate: utc(2026, 12, 7),
})
const STD_M3 = mkModule({
  id: 'mod-3',
  title: 'Modul 3',
  sortOrder: 2,
  scheduleId: 's3',
  startDate: utc(2026, 12, 8),
  endDate: utc(2027, 1, 25),
})
const STD_M4 = mkModule({
  id: 'mod-4',
  title: 'Modul 4',
  sortOrder: 3,
  scheduleId: 's4',
  startDate: utc(2027, 1, 26),
  endDate: utc(2027, 3, 15),
})

describe('computeGroupCapacity — radionica branch', () => {
  it('counts all enrollments for custom (radionica) courses', () => {
    const group = mkGroup({
      maxStudents: 10,
      isCustom: true,
      modules: [],
      enrollments: [
        mkEnrollment('e1', []),
        mkEnrollment('e2', []),
        mkEnrollment('e3', []),
      ],
      reservedInquiriesCount: 2,
    })

    const cap = computeGroupCapacity(group, new Set(), NOW)
    expect(cap.enrolledCount).toBe(3)
    expect(cap.reservedInquiriesCount).toBe(2)
    expect(cap.availableSpots).toBe(5)
    expect(cap.isFull).toBe(false)
    expect(cap.nextEnrollingModule).toBeNull()
  })
})

describe('computeGroupCapacity — per-group arc resolution', () => {
  it('counts enrollments against the per-group nextEnrollingModule', () => {
    // Wed arc on STD_M1..M4 at NOW (15.10.2026) — Wed M1 lastSession = 14.10,
    // so nextEnrollingModule = M2.
    const group = mkGroup({
      maxStudents: 8,
      isCustom: false,
      dayOfWeek: 'Srijeda',
      modules: [STD_M1, STD_M2, STD_M3, STD_M4],
      enrollments: [
        mkEnrollment('e1', ['s1']), // M1 only
        mkEnrollment('e2', ['s2']), // M2 — counts
        mkEnrollment('e3', ['s2']), // M2 — counts
        mkEnrollment('e4', ['s3']), // M3 only
      ],
    })

    const cap = computeGroupCapacity(group, new Set(), NOW)
    expect(cap.nextEnrollingModule?.moduleScheduleId).toBe('s2')
    expect(cap.enrolledCount).toBe(2)
    expect(cap.availableSpots).toBe(6)
  })

  it('Mon vs Wed: same course + date, different nextEnrollingModule when holidays land on Mon', () => {
    const holidays = new Set(['2026-09-21', '2026-10-05'])
    const enrollments = [
      mkEnrollment('e1', ['s1']),
      mkEnrollment('e2', ['s2']),
      mkEnrollment('e3', ['s2']),
    ]

    const wed = mkGroup({
      maxStudents: 8,
      isCustom: false,
      dayOfWeek: 'Srijeda',
      modules: [STD_M1, STD_M2, STD_M3, STD_M4],
      enrollments,
    })
    const mon = mkGroup({
      maxStudents: 8,
      isCustom: false,
      dayOfWeek: 'Ponedjeljak',
      modules: [STD_M1, STD_M2, STD_M3, STD_M4],
      enrollments,
    })
    // 04.11.2026 — Wed has finished M1 (14.10) and is now in M2; Mon is still
    // working through M1 because of the two holidays.
    const asOf = utc(2026, 11, 4)
    const wedCap = computeGroupCapacity(wed, holidays, asOf)
    const monCap = computeGroupCapacity(mon, holidays, asOf)
    // Wed nextEnrollingModule = M3 (M2 in progress, so signup targets M3).
    expect(wedCap.nextEnrollingModule?.moduleScheduleId).toBe('s3')
    expect(wedCap.enrolledCount).toBe(0) // no e attached to s3
    // Mon nextEnrollingModule = M2 (M1 still in progress).
    expect(monCap.nextEnrollingModule?.moduleScheduleId).toBe('s2')
    expect(monCap.enrolledCount).toBe(2) // e2, e3 attached to s2
  })

  it('fallback to lifetime enrollments when arc has no next module (graduated)', () => {
    // Wed past 15.03.2027 — all 4 modules completed, no future module.
    const group = mkGroup({
      maxStudents: 12,
      isCustom: false,
      dayOfWeek: 'Srijeda',
      modules: [STD_M1, STD_M2, STD_M3, STD_M4],
      enrollments: [
        mkEnrollment('e1', ['s1']),
        mkEnrollment('e2', ['s2']),
        mkEnrollment('e3', ['s3']),
        mkEnrollment('e4', ['s4']),
        mkEnrollment('e5', []),
      ],
    })
    const cap = computeGroupCapacity(group, new Set(), utc(2027, 5, 1))
    expect(cap.nextEnrollingModule).toBeNull()
    expect(cap.enrolledCount).toBe(5)
    expect(cap.availableSpots).toBe(7)
  })

  it('fallback to lifetime when schedules lack endDate (arc cannot be computed)', () => {
    // Pre-arc-redesign data: legacy schedules have startDate but no endDate.
    const m1NoEnd = mkModule({
      id: 'mod-1',
      title: 'Modul 1',
      sortOrder: 0,
      scheduleId: 's1',
      startDate: utc(2026, 9, 1),
      endDate: null,
    })
    const group = mkGroup({
      maxStudents: 10,
      isCustom: false,
      modules: [m1NoEnd],
      enrollments: [
        mkEnrollment('e1', ['s1']),
        mkEnrollment('e2', []),
      ],
      reservedInquiriesCount: 1,
    })
    const cap = computeGroupCapacity(group, new Set(), NOW)
    expect(cap.nextEnrollingModule).toBeNull()
    expect(cap.enrolledCount).toBe(2)
    expect(cap.availableSpots).toBe(7)
    expect(cap.isFull).toBe(false)
  })

  it('returns module title on nextEnrollingModule for caller display', () => {
    const group = mkGroup({
      maxStudents: 8,
      isCustom: false,
      modules: [STD_M1, STD_M2, STD_M3, STD_M4],
      enrollments: [],
    })
    // Pre-school-year (Aug) — arc[0].firstSession is in Sept, so M1 is next.
    const cap = computeGroupCapacity(group, new Set(), utc(2026, 8, 15))
    expect(cap.nextEnrollingModule?.title).toBe('Modul 1')
    expect(cap.nextEnrollingModule?.moduleScheduleId).toBe('s1')
  })
})
