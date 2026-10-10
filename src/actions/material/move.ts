'use server'

import type { Session } from 'next-auth'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import type { AdminActionResult } from '@/lib/action-types'
import { canManageMaterial } from '@/lib/material-access'
import { revalidateMaterialPaths } from '@/lib/material-revalidate'
import { otherCityOnlyError } from '@/lib/material-city'
import {
  moveMaterialToLessonSchema,
  setMaterialsAudienceSchema,
} from '@/lib/validators/admin/lesson'

type MovableRow = {
  id: string
  scope: 'LESSON' | 'GROUP' | 'MODULE' | 'COURSE'
  type: string
  scheduledGroupId: string | null
  lessonId: string | null
  uploadedById: string
  city: City | null
}

/**
 * Who may move a material (between audiences or lessons): an admin any lesson
 * material and any group material of their own city; a teacher only a group
 * material they uploaded, in a group they teach — the same split as editing.
 */
async function mayMove(session: Session, row: MovableRow): Promise<boolean> {
  // A material limited to one city is that city's to manage.
  if (otherCityOnlyError(row.city, session.user.city)) return false
  if (row.scope === 'LESSON') {
    // Admin only, and a radionica's lessons only in its own city.
    return (
      session.user.role === 'ADMIN' &&
      row.lessonId !== null &&
      canManageMaterial(session, { scope: 'LESSON', lessonId: row.lessonId })
    )
  }
  if (row.scope !== 'GROUP' || !row.scheduledGroupId) return false
  if (session.user.role === 'TEACHER' && row.uploadedById !== session.user.id) return false
  return canManageMaterial(session, { scope: 'GROUP', scheduledGroupId: row.scheduledGroupId })
}

/**
 * "Premjesti u polaznike" / "Premjesti u nastavnike" for one or many materials.
 * All-or-nothing: one row the caller may not move, or one that cannot carry the
 * audience, refuses the whole batch with its title.
 *
 * Whole-module / whole-program rows are teacher-only by definition (they sit in
 * no lesson), and a RoboCamp guide is for the children only — the DB enforces
 * both as well.
 */
export async function setMaterialsAudience(input: unknown): Promise<AdminActionResult> {
  const session = await requireTeacher()
  const parsed = setMaterialsAudienceSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { materialIds, audience } = parsed.data

  const rows = await db.material.findMany({
    where: { id: { in: materialIds } },
    select: {
      id: true,
      title: true,
      scope: true,
      type: true,
      scheduledGroupId: true,
      lessonId: true,
      uploadedById: true,
      city: true,
    },
  })
  if (rows.length !== new Set(materialIds).size) {
    return { success: false, error: 'Materijal nije pronađen.' }
  }

  for (const row of rows) {
    if (row.scope === 'MODULE' || row.scope === 'COURSE') {
      return { success: false, error: `„${row.title}" je materijal za nastavnike na cijelom modulu ili programu.` }
    }
    if (row.type === 'ROBOCAMP' && audience === 'TEACHER') {
      return { success: false, error: `„${row.title}" je RoboCamp vodič — on je uvijek za polaznike.` }
    }
    const otherCity = otherCityOnlyError(row.city, session.user.city)
    if (otherCity) return otherCity
    if (!(await mayMove(session, row))) {
      return { success: false, error: `Nemate dopuštenje premjestiti „${row.title}".` }
    }
  }

  try {
    await db.material.updateMany({ where: { id: { in: materialIds } }, data: { audience } })
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('setMaterialsAudience failed:', err)
    return { success: false, error: 'Greška pri premještanju materijala.' }
  }
}

/**
 * Moves a lesson or group material to another lesson of the SAME module (for a
 * radionica: of the same program). Changing module is not a move — it would
 * change which groups and weeks see the file — so it is refused.
 */
export async function moveMaterialToLesson(input: unknown): Promise<AdminActionResult> {
  const session = await requireTeacher()
  const parsed = moveMaterialToLessonSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { materialId, lessonId } = parsed.data

  const [row, target] = await Promise.all([
    db.material.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        scope: true,
        type: true,
        scheduledGroupId: true,
        lessonId: true,
        uploadedById: true,
        city: true,
        lesson: { select: { courseId: true, moduleId: true } },
      },
    }),
    db.lesson.findUnique({ where: { id: lessonId }, select: { courseId: true, moduleId: true } }),
  ])
  if (!row || !target) return { success: false, error: 'Materijal ili lekcija nije pronađena.' }
  if (!row.lesson) {
    return { success: false, error: 'Materijal za cijeli modul ili program nije u lekciji.' }
  }
  if (row.lesson.courseId !== target.courseId || row.lesson.moduleId !== target.moduleId) {
    return { success: false, error: 'Materijal se može premjestiti samo u lekciju istog modula.' }
  }
  const otherCity = otherCityOnlyError(row.city, session.user.city)
  if (otherCity) return otherCity
  if (!(await mayMove(session, row))) {
    return { success: false, error: 'Nemate dopuštenje premjestiti ovaj materijal.' }
  }

  try {
    await db.material.update({ where: { id: materialId }, data: { lessonId } })
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('moveMaterialToLesson failed:', err)
    return { success: false, error: 'Greška pri premještanju materijala.' }
  }
}
