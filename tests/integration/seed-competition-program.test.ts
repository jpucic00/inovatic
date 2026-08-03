import { describe, expect, it, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { seedCompetitionProgram } from '../../prisma/seed'
import { createCourseSeason } from './helpers/factory'

/**
 * `npm run db:seed:competition` runs against the live DB, so both promises get
 * asserted: idempotent (one shared course, five natjecanja, stable ids) and
 * non-destructive (a planned CourseSeason survives a re-seed).
 */

const SLUG = 'natjecateljski-program'
const SEASON_YEAR = '2031/2032' // far from every other file's years

afterAll(async () => {
  await db.courseSeason.deleteMany({
    where: { schoolYear: SEASON_YEAR, course: { slug: SLUG } },
  })
})

describe('seedCompetitionProgram', () => {
  it('is idempotent — one shared course, five natjecanja, stable module ids', async () => {
    await seedCompetitionProgram()
    const first = await db.course.findUniqueOrThrow({
      where: { slug: SLUG },
      select: {
        id: true,
        kind: true,
        city: true,
        level: true,
        sortOrder: true,
        modules: { select: { id: true, title: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
    expect(first.kind).toBe('COMPETITION')
    expect(first.city).toBeNull()
    expect(first.level).toBeNull()
    expect(first.sortOrder).toBe(5)
    expect(first.modules).toHaveLength(5)

    await seedCompetitionProgram()
    const second = await db.course.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true, modules: { select: { id: true }, orderBy: { sortOrder: 'asc' } } },
    })
    expect(second.id).toBe(first.id)
    expect(second.modules.map((m) => m.id)).toEqual(first.modules.map((m) => m.id))
    expect(await db.course.count({ where: { slug: SLUG } })).toBe(1)
  })

  it('does not touch an existing CourseSeason on re-seed', async () => {
    const course = await db.course.findUniqueOrThrow({ where: { slug: SLUG } })
    const season = await createCourseSeason(course.id, {
      schoolYear: SEASON_YEAR,
      city: 'SPLIT',
      startDate: new Date(Date.UTC(2031, 8, 15)),
      endDate: new Date(Date.UTC(2032, 5, 15)),
    })

    await seedCompetitionProgram()

    const surviving = await db.courseSeason.findUniqueOrThrow({
      where: { id: season.id },
      select: { startDate: true, endDate: true },
    })
    expect(surviving.startDate?.toISOString()).toBe('2031-09-15T00:00:00.000Z')
    expect(surviving.endDate?.toISOString()).toBe('2032-06-15T00:00:00.000Z')
  })
})
