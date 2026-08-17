/**
 * `getMyCurrentEnrollments` — what a child sees on the portal (Flux t5f6sss).
 *
 * The dashboard resolves the active module PER GROUP, because two groups of one
 * program on different weekdays drift apart as soon as a holiday lands on one of
 * them: the Monday group is still finishing Modul 1 while Wednesday has moved
 * on. Resolve it once for the course and half the portal — materials, the
 * evaluation pill, the module label — points a child at the wrong module.
 *
 * Same wiring repeats in student/materials.ts, student/gallery.ts and
 * teacher/gallery.ts; one case through the dashboard covers the shape.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { createEnrollment, createModule, createStudent } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { mockSession } from './setup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
  }
})

const { getMyCurrentEnrollments } = await import('@/actions/student/dashboard')

const YEAR = computeSchoolYear()
const scope = fixtureScope()
const holidayDates: Date[] = []

const WEEKDAYS = [
  'Nedjelja',
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

/** UTC midnight `days` from today — the shape `@db.Date` columns compare on. */
function dayOffset(days: number): Date {
  const d = new Date()
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  )
}

const weekdayOf = (days: number) => WEEKDAYS[dayOffset(days).getUTCDay()]

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
})

afterAll(async () => {
  await db.schoolYearHoliday.deleteMany({ where: { date: { in: holidayDates } } })
  await scope.cleanup()
})

describe('getMyCurrentEnrollments — the active module is per group', () => {
  it('two weekdays of one program sit in different modules once holidays hit one of them', async () => {
    const course = await scope.course({ kind: 'STANDARD', title: 'SLR 1' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    for (const [mod, start, end] of [
      [m1, dayOffset(-56), dayOffset(-10)],
      [m2, dayOffset(-7), dayOffset(40)],
    ] as const) {
      await db.moduleSchedule.create({
        data: {
          moduleId: mod.id,
          schoolYear: YEAR,
          city: 'SPLIT',
          startDate: start,
          endDate: end,
        },
      })
    }

    // Three holidays on the FIRST group's weekday only. Holidays are stored per
    // (schoolYear, city) — what makes them hit one group and not the other is
    // that they land on dates the other group never meets.
    for (const offset of [-49, -42, -35]) {
      const date = dayOffset(offset)
      holidayDates.push(date)
      await db.schoolYearHoliday.create({
        data: { schoolYear: YEAR, city: 'SPLIT', date },
      })
    }

    const slowGroup = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      name: 'A grupa',
      dayOfWeek: weekdayOf(0),
    })
    const fastGroup = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      name: 'B grupa',
      dayOfWeek: weekdayOf(2),
    })

    const student = await createStudent()
    await createEnrollment(student.id, slowGroup.id, { schoolYear: YEAR })
    await createEnrollment(student.id, fastGroup.id, { schoolYear: YEAR })
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    const summaries = await getMyCurrentEnrollments()

    const slow = summaries.find((s) => s.group.id === slowGroup.id)
    const fast = summaries.find((s) => s.group.id === fastGroup.id)
    // Three lost sessions push the slow group's Modul 1 past today; the other
    // weekday finished it on time and is already inside Modul 2.
    expect(slow?.activeModule?.title).toBe('Modul 1')
    expect(fast?.activeModule?.title).toBe('Modul 2')
  })

  it('has no active module for a radionica — nothing paces it', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      dateStart: '2026-09-14',
      dateEnd: '2026-09-18',
    })
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: YEAR })
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    const summaries = await getMyCurrentEnrollments()

    expect(summaries).toHaveLength(1)
    expect(summaries[0].activeModule).toBeNull()
  })
})

describe('getMyCurrentEnrollments — ordering', () => {
  it('orders by program, then by group name — never by when the child was enrolled', async () => {
    // The factory has no sortOrder knob and every course would otherwise tie on
    // its default, which is exactly the ambiguity this test exists to rule out.
    const later = await scope.course({ kind: 'STANDARD', title: 'SLR 2' })
    const earlier = await scope.course({ kind: 'STANDARD', title: 'SLR 1' })
    await db.course.update({ where: { id: later.id }, data: { sortOrder: 92 } })
    await db.course.update({ where: { id: earlier.id }, data: { sortOrder: 91 } })
    const secondOfEarlier = await scope.group({
      courseId: earlier.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      name: 'B grupa',
    })
    const firstOfEarlier = await scope.group({
      courseId: earlier.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      name: 'A grupa',
    })
    const laterGroup = await scope.group({
      courseId: later.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      name: 'A grupa',
    })

    const student = await createStudent()
    // Enrolled in reverse: creation order must not survive into the payload.
    await createEnrollment(student.id, laterGroup.id, { schoolYear: YEAR })
    await createEnrollment(student.id, secondOfEarlier.id, { schoolYear: YEAR })
    await createEnrollment(student.id, firstOfEarlier.id, { schoolYear: YEAR })
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    const summaries = await getMyCurrentEnrollments()

    expect(summaries.map((s) => s.group.id)).toEqual([
      firstOfEarlier.id,
      secondOfEarlier.id,
      laterGroup.id,
    ])
  })

  it('returns only the caller’s own enrollments', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    const group = await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })
    const mine = await createStudent()
    const theirs = await createStudent()
    await createEnrollment(mine.id, group.id, { schoolYear: YEAR })
    await createEnrollment(theirs.id, group.id, { schoolYear: YEAR })
    mockSession({ id: mine.id, role: 'STUDENT', city: 'SPLIT' })

    const summaries = await getMyCurrentEnrollments()

    expect(summaries).toHaveLength(1)
    expect(summaries[0].group.id).toBe(group.id)
  })
})
