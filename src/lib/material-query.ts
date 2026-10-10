import type { City, Prisma } from '@prisma/client'

/**
 * Who the effective set is computed for (Materijali v2, 2026-10-10).
 *
 *   - STUDENT — the portal: a parent account with a chosen child, the classroom
 *     account. Only STUDENT-audience materials, and only inside lessons.
 *   - STAFF — teachers (incl. substitutes) and admins. Both audiences, plus the
 *     teacher-only whole-module / whole-program rows.
 */
export type MaterialViewer = 'STUDENT' | 'STAFF'

/**
 * Inputs needed to compute the effective material set for a ScheduledGroup.
 * Caller is responsible for loading these from the DB.
 */
type MaterialScopeContext = {
  scheduledGroupId: string
  courseId: string
  /** Modules whose lessons (and, for staff, whole-module rows) are in view. */
  moduleIds: string[]
  viewer: MaterialViewer
  /** The group's city — a material limited to the OTHER city never applies. */
  city: City
}

/**
 * Curriculum is shared by both cities (city null); a row an admin limited to one
 * city applies only to that city's groups. GROUP rows are always null here —
 * they belong to their group already.
 */
export function materialCityWhere(city: City): Prisma.MaterialWhereInput {
  return { OR: [{ city: null }, { city }] }
}

/**
 * Lessons of this program that are in view: those of the given modules — or,
 * for a program without modules (a radionica), the lessons that sit directly
 * under it. Never both: a module-less lesson on a program WITH modules is not
 * something the editor creates, and if raw data ever produced one it must not
 * become downloadable while no page lists it.
 */
export function visibleLessonWhere(courseId: string, moduleIds: string[]): Prisma.LessonWhereInput {
  return moduleIds.length > 0
    ? { courseId, moduleId: { in: moduleIds } }
    : { courseId, moduleId: null }
}

/**
 * Produces a Prisma `where` clause for the union of:
 *   - LESSON materials in a lesson of this program that is in view
 *   - GROUP materials of this ScheduledGroup (each sits in a lesson too)
 *   - STAFF only: teacher-only whole-program (COURSE) rows of this program and
 *     whole-module (MODULE) rows of the modules in view
 * minus rows limited to the other city, minus any rows hidden for this group
 * via MaterialGroupHide — and, for the
 * STUDENT viewer, minus every TEACHER-audience row. That audience filter is the
 * line between the staff room and the portal; every portal read and the portal
 * branch of the download route go through here.
 */
export function buildEffectiveMaterialsWhere(ctx: MaterialScopeContext): Prisma.MaterialWhereInput {
  const lesson = visibleLessonWhere(ctx.courseId, ctx.moduleIds)

  const scopeBranches: Prisma.MaterialWhereInput[] = [
    { scope: 'LESSON', lesson },
    { scope: 'GROUP', scheduledGroupId: ctx.scheduledGroupId, lesson },
  ]

  if (ctx.viewer === 'STAFF') {
    scopeBranches.push({ scope: 'COURSE', courseId: ctx.courseId })
    if (ctx.moduleIds.length > 0) {
      scopeBranches.push({ scope: 'MODULE', moduleId: { in: ctx.moduleIds } })
    }
  }

  const and: Prisma.MaterialWhereInput[] = [
    { OR: scopeBranches },
    materialCityWhere(ctx.city),
    { NOT: { hiddenInGroups: { some: { scheduledGroupId: ctx.scheduledGroupId } } } },
  ]
  if (ctx.viewer === 'STUDENT') and.push({ audience: 'STUDENT' })

  return { AND: and }
}
