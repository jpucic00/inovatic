/**
 * The 2026-10-26 data migration replayed against rows that need it.
 *
 * `npm run test:integration` deploys every migration onto an EMPTY database,
 * so the merge in `20261026160000_merge_robokup_nmt_module` never finds a
 * Robokup module in the ordinary run. Replaying it here is the only place its
 * effect is exercised before production. Each case runs inside a transaction
 * that is rolled back, because the migration targets the one shared
 * `natjecateljski-program` course other files also use.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { seedCompetitionProgram } from '../../prisma/seed'
import { createAdmin, createGroup } from './helpers/factory'

const MIGRATION = readFileSync(
  'prisma/migrations/20261026160000_merge_robokup_nmt_module/migration.sql',
  'utf8',
)
const MERGED = 'Natjecanje mladih tehničara i Robokup'

class Rollback extends Error {}

/** Runs `body` against the shared course with its existing modules set aside, then rolls back. */
async function inRolledBackTx(body: (tx: Prisma.TransactionClient, courseId: string) => Promise<void>) {
  const course = await seedCompetitionProgram()
  await expect(
    db.$transaction(async (tx) => {
      // Titles the migration looks for must only be the ones this case creates.
      await tx.courseModule.updateMany({
        where: { courseId: course.id },
        data: { title: 'izvan testa', sortOrder: 100 },
      })
      await body(tx, course.id)
      throw new Rollback()
    }),
  ).rejects.toBeInstanceOf(Rollback)
}

describe('20261026160000_merge_robokup_nmt_module', () => {
  it('moves lessons, sats, materials and gallery onto NMT, drops colliding sats, deletes only Robokup', async () => {
    const admin = await createAdmin()
    const course = await seedCompetitionProgram()
    const group = await createGroup({ courseId: course.id })
    await inRolledBackTx(async (tx, courseId) => {
      const fll = await tx.courseModule.create({ data: { courseId, title: 'FIRST LEGO League', sortOrder: 1 } })
      const nmt = await tx.courseModule.create({ data: { courseId, title: 'Natjecanje mladih tehničara', sortOrder: 3 } })
      const robokup = await tx.courseModule.create({ data: { courseId, title: 'Robokup', sortOrder: 4 } })
      const pripreme = await tx.courseModule.create({ data: { courseId, title: 'Pripreme za natjecanja', sortOrder: 5 } })

      const nmtLesson = await tx.lesson.create({
        data: { courseId, moduleId: nmt.id, title: 'NMT 1', sortOrder: 2, sessions: { create: [{ sessionNumber: 1 }] } },
      })
      const rkLesson = await tx.lesson.create({
        data: {
          courseId,
          moduleId: robokup.id,
          title: 'Robokup 1',
          sortOrder: 0,
          sessions: { create: [{ sessionNumber: 1 }, { sessionNumber: 2 }] },
        },
      })
      const lessonMaterial = await tx.material.create({
        data: { scope: 'LESSON', audience: 'STUDENT', lessonId: rkLesson.id, title: 'Upute', type: 'DOCUMENT', uploadedById: admin.id },
      })
      const moduleMaterial = await tx.material.create({
        data: { scope: 'MODULE', audience: 'TEACHER', moduleId: robokup.id, title: 'Pravila', type: 'DOCUMENT', uploadedById: admin.id },
      })
      const image = await tx.galleryImage.create({
        data: { scheduledGroupId: group.id, moduleId: robokup.id, url: 'https://x/y.jpg', publicId: 'y', uploadedById: admin.id },
      })

      await tx.$executeRawUnsafe(MIGRATION)

      expect(await tx.courseModule.findUnique({ where: { id: robokup.id } })).toBeNull()
      const modules = await tx.courseModule.findMany({
        where: { courseId, id: { in: [fll.id, nmt.id, pripreme.id] } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, sortOrder: true },
      })
      expect(modules).toEqual([
        { id: fll.id, title: 'FIRST LEGO League', sortOrder: 1 },
        { id: nmt.id, title: MERGED, sortOrder: 2 },
        { id: pripreme.id, title: 'Pripreme za natjecanja', sortOrder: 3 },
      ])

      // Robokup's lesson moved after NMT's; its sat 1 collided and was dropped, sat 2 survived.
      const moved = await tx.lesson.findUniqueOrThrow({
        where: { id: rkLesson.id },
        select: { moduleId: true, sortOrder: true, sessions: { select: { moduleId: true, sessionNumber: true } } },
      })
      expect(moved).toEqual({ moduleId: nmt.id, sortOrder: 3, sessions: [{ moduleId: nmt.id, sessionNumber: 2 }] })
      const kept = await tx.lesson.findUniqueOrThrow({ where: { id: nmtLesson.id }, select: { sessions: { select: { sessionNumber: true } } } })
      expect(kept.sessions).toEqual([{ sessionNumber: 1 }])

      expect((await tx.material.findUniqueOrThrow({ where: { id: lessonMaterial.id } })).lessonId).toBe(rkLesson.id)
      expect((await tx.material.findUniqueOrThrow({ where: { id: moduleMaterial.id } })).moduleId).toBe(nmt.id)
      expect((await tx.galleryImage.findUniqueOrThrow({ where: { id: image.id } })).moduleId).toBe(nmt.id)

      // Idempotent: a second run finds no Robokup module and changes nothing.
      await tx.$executeRawUnsafe(MIGRATION)
      expect(await tx.courseModule.count({ where: { id: { in: [fll.id, nmt.id, pripreme.id] } } })).toBe(3)
      expect((await tx.courseModule.findUniqueOrThrow({ where: { id: nmt.id } })).title).toBe(MERGED)
    })
  })

  it('aborts rather than merge two schedules for the same year and city', async () => {
    await inRolledBackTx(async (tx, courseId) => {
      const nmt = await tx.courseModule.create({ data: { courseId, title: 'Natjecanje mladih tehničara', sortOrder: 3 } })
      const robokup = await tx.courseModule.create({ data: { courseId, title: 'Robokup', sortOrder: 4 } })
      for (const moduleId of [nmt.id, robokup.id]) {
        await tx.moduleSchedule.create({ data: { moduleId, schoolYear: '2031/2032', city: 'SPLIT' } })
      }
      await expect(tx.$executeRawUnsafe(MIGRATION)).rejects.toThrow(/same school year and city/)
      throw new Rollback()
    })
  })
})
