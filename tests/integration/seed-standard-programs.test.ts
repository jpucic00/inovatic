import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { courses as catalog } from '@/lib/courses-data'
import { seedStandardPrograms } from '../../prisma/seed'
import { createEnrollment, createMaterial, createStudent, createTeacher } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

/**
 * `npm run db:seed:programs` is what carries a courses-data.ts correction to
 * production, so its three contracts get their own tests: idempotent (a second
 * run creates nothing new), deliberately OVERWRITING (drifted live copy is
 * corrected back — updateCourse refuses STANDARD programs, so there is never
 * admin-authored copy to clobber), and non-destructive (groups, enrollments and
 * materials hanging off the seeded rows survive, and module ids are stable so
 * MODULE materials keep pointing at the right module).
 */

const CATALOG_SLUGS = catalog.map((c) => c.slug)

const fx = fixtureScope()
let seededMaterialId: string | null = null

beforeAll(async () => {
  await seedStandardPrograms()
})

afterAll(async () => {
  if (seededMaterialId) {
    await db.material.deleteMany({ where: { id: seededMaterialId } })
  }
  await fx.cleanup()
  // The canonical courses stay — they are exactly what the seeder maintains,
  // and later files reach them through ensureCourse-style upserts anyway.
})

describe('seedStandardPrograms', () => {
  it('is idempotent — a second run creates no duplicate courses or modules and keeps module ids', async () => {
    const before = await db.course.findMany({
      where: { slug: { in: CATALOG_SLUGS } },
      select: { id: true, slug: true, modules: { select: { id: true, title: true } } },
      orderBy: { slug: 'asc' },
    })
    expect(before).toHaveLength(CATALOG_SLUGS.length)

    await seedStandardPrograms()

    const after = await db.course.findMany({
      where: { slug: { in: CATALOG_SLUGS } },
      select: { id: true, slug: true, modules: { select: { id: true, title: true } } },
      orderBy: { slug: 'asc' },
    })
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id))
    const moduleIds = (rows: typeof before) =>
      rows.flatMap((c) => c.modules.map((m) => m.id)).sort((a, b) => a.localeCompare(b))
    expect(moduleIds(after)).toEqual(moduleIds(before))
  })

  it('overwrites drifted live copy back to courses-data.ts values', async () => {
    const uvod = catalog[0]
    await db.course.update({
      where: { slug: uvod.slug },
      data: { ageMin: 99, subtitle: 'Ručno prepravljen podnaslov' },
    })
    const driftedModule = await db.courseModule.findFirstOrThrow({
      where: { course: { slug: uvod.slug } },
    })
    await db.courseModule.update({
      where: { id: driftedModule.id },
      data: { description: 'Ručno prepravljen opis' },
    })

    await seedStandardPrograms()

    const corrected = await db.course.findUniqueOrThrow({
      where: { slug: uvod.slug },
      select: { ageMin: true, subtitle: true },
    })
    expect(corrected.ageMin).toBe(uvod.ageMin)
    expect(corrected.subtitle).toBe(uvod.subtitle)
    const correctedModule = await db.courseModule.findUniqueOrThrow({
      where: { id: driftedModule.id },
      select: { description: true },
    })
    expect(correctedModule.description).not.toBe('Ručno prepravljen opis')
  })

  it('leaves groups, enrollments and MODULE materials on seeded rows untouched', async () => {
    const slr2 = await db.course.findUniqueOrThrow({
      where: { slug: 'slr-2' },
      select: { id: true, modules: { select: { id: true }, orderBy: { sortOrder: 'asc' } } },
    })
    const group = await fx.group({ courseId: slr2.id })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id)
    const teacher = await createTeacher()
    const material = await createMaterial({
      scope: 'MODULE',
      courseId: slr2.id,
      moduleId: slr2.modules[0].id,
      uploadedById: teacher.id,
    })
    seededMaterialId = material.id

    await seedStandardPrograms()

    expect(await db.scheduledGroup.findUnique({ where: { id: group.id } })).not.toBeNull()
    expect(await db.enrollment.findUnique({ where: { id: enrollment.id } })).not.toBeNull()
    const survivingMaterial = await db.material.findUniqueOrThrow({
      where: { id: material.id },
      select: { moduleId: true },
    })
    // Module upserted by title, never recreated — the FK still points at it.
    expect(survivingMaterial.moduleId).toBe(slr2.modules[0].id)
  })
})
