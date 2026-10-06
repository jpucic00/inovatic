/**
 * `getPublicSchedulePrograms` — `/raspored` is visible all year (Flux 3hozafk).
 *
 * A program with an open window is exactly the `/prijava` feed, seats included;
 * one without shows its current-year groups with `availableSpots: null`, so the
 * page prints the timetable and nothing about seats. Fixtures are dated
 * relative to now because the loader reads the real clock.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import { relativeDateKey } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getPublicSchedulePrograms } = await import('@/actions/public/programs')

const YEAR = computeSchoolYear()
const scope = fixtureScope()
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

afterAll(async () => {
  await scope.cleanup()
})

const programOf = async (courseId: string, city: 'SPLIT' | 'SIBENIK' = 'SPLIT') =>
  (await getPublicSchedulePrograms(city)).find((p) => p.id === courseId)

describe('getPublicSchedulePrograms', () => {
  it('lists a closed standard program’s current-year groups without seats', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    const group = await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })

    const program = await programOf(course.id)

    expect(program?.groups.map((g) => g.id)).toEqual([group.id])
    expect(program?.groups[0].availableSpots).toBeNull()
    expect(program?.groups[0].isFull).toBe(false)
  })

  it('keeps seats on an open program — it is the /prijava feed', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    await db.courseEnrollmentWindow.create({
      data: {
        courseId: course.id,
        schoolYear: YEAR,
        city: 'SPLIT',
        enrollmentStart: daysFromNow(-1),
        enrollmentEnd: daysFromNow(30),
      },
    })
    await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(22),
    })

    const program = await programOf(course.id)

    expect(program?.groups).toHaveLength(1)
    expect(program?.groups[0].availableSpots).toBe(12)
  })

  it('drops a closed radionica that has ended, keeps one still running', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      dateStart: relativeDateKey(-10),
      dateEnd: relativeDateKey(-5),
    })
    const running = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      dateStart: relativeDateKey(-2),
      dateEnd: relativeDateKey(3),
    })

    const program = await programOf(course.id)

    expect(program?.groups.map((g) => g.id)).toEqual([running.id])
  })

  it('shows neither another year, another city nor the competition program', async () => {
    // Outside July/August — through the summer the coming year is the point.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${YEAR.slice(0, 4)}-10-15T10:00:00Z`) })
    const course = await scope.course({ kind: 'STANDARD' })
    await scope.group({ courseId: course.id, schoolYear: getNextSchoolYear(YEAR), city: 'SPLIT' })
    await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SIBENIK' })
    const competition = await scope.course({ kind: 'COMPETITION' })
    await scope.group({ courseId: competition.id, schoolYear: YEAR, city: 'SPLIT' })

    expect(await programOf(course.id)).toBeUndefined()
    expect(await programOf(competition.id)).toBeUndefined()
    expect((await programOf(course.id, 'SIBENIK'))?.groups).toHaveLength(1)
    vi.useRealTimers()
  })
})

/**
 * The school year flips on 1 September, so in July and August "current" is the
 * year that has just ended. Once the city has groups for the coming year, the
 * closed half lists those (owner, 2026-10-06). Far-off years, so no other
 * fixture in the shared test DB can be in either one.
 */
describe('getPublicSchedulePrograms — through the summer', () => {
  const ENDING = '2040/2041'
  const COMING = '2041/2042'
  const at = (iso: string) => vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('in July, lists the coming year once the city has groups in it', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await scope.group({ courseId: course.id, schoolYear: ENDING, city: 'SPLIT' })
    const coming = await scope.group({ courseId: course.id, schoolYear: COMING, city: 'SPLIT' })
    at('2041-07-15T10:00:00Z')

    expect((await programOf(course.id))?.groups.map((g) => g.id)).toEqual([coming.id])
  })

  it('in August, stays on the ending year while the coming one has no groups yet', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    const ending = await scope.group({ courseId: course.id, schoolYear: ENDING, city: 'SIBENIK' })
    at('2041-08-20T10:00:00Z')

    expect((await programOf(course.id, 'SIBENIK'))?.groups.map((g) => g.id)).toEqual([ending.id])
  })

  it('from 1 September the current year is simply current', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    const current = await scope.group({ courseId: course.id, schoolYear: COMING, city: 'SPLIT' })
    await scope.group({ courseId: course.id, schoolYear: '2042/2043', city: 'SPLIT' })
    at('2041-09-15T10:00:00Z')

    expect((await programOf(course.id))?.groups.map((g) => g.id)).toEqual([current.id])
  })
})
