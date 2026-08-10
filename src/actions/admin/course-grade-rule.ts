'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { adminAction } from '@/lib/admin-action'
import { archivedYearError } from '@/lib/school-year-guard'
import { hasDatedModules } from '@/lib/program-kind'
import {
  resetCourseGradeRuleSchema,
  upsertCourseGradeRuleSchema,
  type ResetCourseGradeRuleInput,
  type UpsertCourseGradeRuleInput,
} from '@/lib/validators/admin/course-grade-rule'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * Only the standard SLR ladder has a razred rule to configure. Radionice are
 * reached through `/radionice/<slug>` and the competitive program through its
 * invitation link — both bypass the grade narrowing entirely, so a rule saved
 * against them would be dead data that reads as if it did something.
 *
 * Mirrors the `hasDatedModules` gate `programsForSelection` applies, so the two
 * can never disagree about which programs the razred rule governs.
 */
async function assertGradeRuleTarget(
  courseId: string,
): Promise<Extract<AdminActionResult, { success: false }> | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { kind: true },
  })
  if (!course) return { success: false, error: 'Program nije pronađen.' }
  if (!hasDatedModules(course.kind)) {
    return { success: false, error: 'Razredi se postavljaju samo za standardne programe.' }
  }
  return null
}

function revalidateGradeRule(): void {
  revalidatePath('/admin/programi', 'layout')
  revalidatePath('/prijava')
}

/**
 * Save which razredi this program is offered to in `schoolYear`, for the
 * admin's own city. An empty list is a legitimate save — it takes the program
 * off the public form for every razred without touching its groups.
 */
export async function upsertCourseGradeRule(
  data: UpsertCourseGradeRuleInput,
): Promise<AdminActionResult> {
  return adminAction(
    upsertCourseGradeRuleSchema,
    data,
    async ({ courseId, schoolYear, grades }, { city }) => {
      const blocked = archivedYearError(schoolYear)
      if (blocked) return blocked

      const wrongKind = await assertGradeRuleTarget(courseId)
      if (wrongKind) return wrongKind

      try {
        await db.courseGradeRule.upsert({
          where: { courseId_schoolYear_city: { courseId, schoolYear, city } },
          create: { courseId, schoolYear, city, grades },
          update: { grades },
        })
      } catch (err) {
        console.error('upsertCourseGradeRule failed:', err)
        return { success: false, error: 'Greška pri spremanju razreda.' }
      }

      revalidateGradeRule()
      return { success: true }
    },
  )
}

/**
 * Drop the override so the program falls back to the default razred ladder.
 * Deleting the row rather than writing the defaults into it is what makes the
 * fallback keep tracking `GRADE_TO_LEVEL` if the catalog ever changes.
 */
export async function resetCourseGradeRule(
  data: ResetCourseGradeRuleInput,
): Promise<AdminActionResult> {
  return adminAction(
    resetCourseGradeRuleSchema,
    data,
    async ({ courseId, schoolYear }, { city }) => {
      const blocked = archivedYearError(schoolYear)
      if (blocked) return blocked

      const wrongKind = await assertGradeRuleTarget(courseId)
      if (wrongKind) return wrongKind

      try {
        await db.courseGradeRule.deleteMany({ where: { courseId, schoolYear, city } })
      } catch (err) {
        console.error('resetCourseGradeRule failed:', err)
        return { success: false, error: 'Greška pri vraćanju na zadano.' }
      }

      revalidateGradeRule()
      return { success: true }
    },
  )
}
