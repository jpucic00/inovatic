'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { City } from '@prisma/client'
import { adminAction } from '@/lib/admin-action'
import { requireAdmin, requireAdminCtx } from '@/lib/auth-guard'
import type { AdminActionResult } from '@/lib/action-types'
import { lessonPlacementError } from '@/lib/lesson-rules'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import { revalidateMaterialPaths } from '@/lib/material-revalidate'
import {
  createLessonSchema,
  updateLessonSchema,
  type CreateLessonInput,
  type UpdateLessonInput,
} from '@/lib/validators/admin/lesson'

type CreateLessonResult = { success: true; lessonId: string } | { success: false; error: string }

/**
 * Lessons are curriculum: admin-only, shared by both cities, never year-scoped
 * (Materijali v2, 2026-10-10). Teachers only add group materials INTO them.
 */

type Tx = Prisma.TransactionClient

/** The module's first module flag + the program kind, or an error. */
async function resolvePlacement(
  tx: Tx,
  city: City,
  courseId: string,
  moduleId: string | null,
  sessionNumbers: number[],
): Promise<string | null> {
  const course = await tx.course.findUnique({
    where: { id: courseId },
    select: { kind: true, city: true, modules: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
  })
  // A radionica belongs to its city: another city's admin reads it as missing.
  if (!course || (course.city !== null && course.city !== city)) return 'Program nije pronađen.'
  if (moduleId !== null && !course.modules.some((m) => m.id === moduleId)) {
    return 'Modul ne pripada ovom programu.'
  }
  return lessonPlacementError({
    kind: course.kind,
    moduleId,
    isFirstModule: moduleId !== null && course.modules[0]?.id === moduleId,
    sessionNumbers,
  })
}

/**
 * One lesson per (module, sat) is a DB unique; this names the lesson already
 * holding a sat so the admin knows which one to change.
 */
async function takenSessionsError(
  tx: Tx,
  moduleId: string | null,
  sessionNumbers: number[],
  exceptLessonId: string | null,
): Promise<string | null> {
  if (moduleId === null || sessionNumbers.length === 0) return null
  const taken = await tx.lessonSession.findFirst({
    where: {
      moduleId,
      sessionNumber: { in: sessionNumbers },
      ...(exceptLessonId ? { lessonId: { not: exceptLessonId } } : {}),
    },
    select: { sessionNumber: true, lesson: { select: { title: true } } },
    orderBy: { sessionNumber: 'asc' },
  })
  if (!taken) return null
  return `${formatLessonSessions([taken.sessionNumber])} već ima lekciju „${taken.lesson.title}".`
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

class LessonError extends Error {}

/**
 * Creates a lesson and, in the same transaction, the materials staged on the
 * "Nova lekcija" page — either the lesson arrives with its files or nothing does.
 */
export async function createLesson(data: CreateLessonInput): Promise<CreateLessonResult> {
  const session = await requireAdmin()
  const { city } = session.user
  const parsed = createLessonSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const input = parsed.data

  try {
    const lessonId = await db.$transaction(async (tx) => {
      const placement = await resolvePlacement(tx, city, input.courseId, input.moduleId, input.sessionNumbers)
      if (placement) throw new LessonError(placement)
      const taken = await takenSessionsError(tx, input.moduleId, input.sessionNumbers, null)
      if (taken) throw new LessonError(taken)

      // New lessons go to the end of the undated order; dated ones sort by sat.
      const last = await tx.lesson.aggregate({
        where: { courseId: input.courseId, moduleId: input.moduleId },
        _max: { sortOrder: true },
      })

      const lesson = await tx.lesson.create({
        data: {
          courseId: input.courseId,
          moduleId: input.moduleId,
          title: input.title,
          description: input.description,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
        select: { id: true },
      })
      if (input.moduleId !== null && input.sessionNumbers.length > 0) {
        await tx.lessonSession.createMany({
          data: input.sessionNumbers.map((sessionNumber) => ({
            lessonId: lesson.id,
            moduleId: input.moduleId as string,
            sessionNumber,
          })),
        })
      }
      if (input.materials.length > 0) {
        await tx.material.createMany({
          data: input.materials.map((m, index) => ({
            scope: 'LESSON' as const,
            audience: m.audience,
            lessonId: lesson.id,
            title: m.title,
            description: m.description || null,
            type: m.type,
            fileUrl: m.fileUrl || null,
            externalUrl: m.externalUrl || null,
            fileSize: m.fileSize ?? null,
            mimeType: m.mimeType || null,
            sortOrder: index,
            uploadedById: session.user.id,
          })),
        })
      }
      return lesson.id
    })
    revalidateMaterialPaths()
    return { success: true, lessonId }
  } catch (err) {
    if (err instanceof LessonError) return { success: false, error: err.message }
    if (isUniqueViolation(err)) {
      return { success: false, error: 'Netko je upravo zauzeo jedan od odabranih sati. Osvježite stranicu.' }
    }
    console.error('createLesson failed:', err)
    return { success: false, error: 'Greška pri spremanju lekcije.' }
  }
}

/** Renames a lesson and replaces its sats. Its materials stay where they are. */
export async function updateLesson(data: UpdateLessonInput): Promise<AdminActionResult> {
  return adminAction(updateLessonSchema, data, async (input, { city }) => {
    try {
      await db.$transaction(async (tx) => {
        const lesson = await tx.lesson.findUnique({
          where: { id: input.id },
          select: { courseId: true, moduleId: true },
        })
        if (!lesson) throw new LessonError('Lekcija nije pronađena.')
        const placement = await resolvePlacement(tx, city, lesson.courseId, lesson.moduleId, input.sessionNumbers)
        if (placement) throw new LessonError(placement)
        const taken = await takenSessionsError(tx, lesson.moduleId, input.sessionNumbers, input.id)
        if (taken) throw new LessonError(taken)

        await tx.lesson.update({
          where: { id: input.id },
          data: { title: input.title, description: input.description },
        })
        await tx.lessonSession.deleteMany({ where: { lessonId: input.id } })
        if (lesson.moduleId !== null && input.sessionNumbers.length > 0) {
          await tx.lessonSession.createMany({
            data: input.sessionNumbers.map((sessionNumber) => ({
              lessonId: input.id,
              moduleId: lesson.moduleId as string,
              sessionNumber,
            })),
          })
        }
      })
      revalidateMaterialPaths()
      return { success: true }
    } catch (err) {
      if (err instanceof LessonError) return { success: false, error: err.message }
      if (isUniqueViolation(err)) {
        return { success: false, error: 'Netko je upravo zauzeo jedan od odabranih sati. Osvježite stranicu.' }
      }
      console.error('updateLesson failed:', err)
      return { success: false, error: 'Greška pri spremanju lekcije.' }
    }
  })
}

/**
 * Deletes an EMPTY lesson. One that still holds materials — curriculum or any
 * group's own — is refused with the count: move or delete them first. The FK
 * (Material.lesson onDelete: Restrict) backs this up.
 */
export async function deleteLesson(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'Lekcija nije pronađena.' }

  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { course: { select: { city: true } }, _count: { select: { materials: true } } },
  })
  if (!lesson || (lesson.course.city !== null && lesson.course.city !== city)) {
    return { success: false, error: 'Lekcija nije pronađena.' }
  }
  const count = lesson._count.materials
  if (count > 0) {
    return {
      success: false,
      error: `Lekcija ima ${count} ${count === 1 ? 'materijal' : 'materijala'} — premjestite ih ili obrišite prije brisanja lekcije.`,
    }
  }

  try {
    await db.lesson.delete({ where: { id } })
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return { success: false, error: 'Lekcija je upravo dobila materijal. Osvježite stranicu.' }
    }
    console.error('deleteLesson failed:', err)
    return { success: false, error: 'Greška pri brisanju lekcije.' }
  }
}
