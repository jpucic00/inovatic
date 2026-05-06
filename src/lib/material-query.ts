import type { Prisma } from '@prisma/client'

/**
 * Inputs needed to compute the effective material set for a ScheduledGroup.
 * Caller is responsible for loading these from the DB.
 */
export type MaterialScopeContext = {
  scheduledGroupId: string
  courseId: string
  courseIsCustom: boolean
  moduleIds: string[]
}

/**
 * Produces a Prisma `where` clause for the union of:
 *   - MODULE-scoped materials for any module in this course (standard programs)
 *   - COURSE-scoped materials for this course (radionice only — `isCustom=true`)
 *   - GROUP-scoped materials for this specific ScheduledGroup
 * minus any rows hidden for this group via MaterialGroupHide.
 *
 * The hide-exclusion is expressed as `NOT { hiddenInGroups: { some: ... } }`
 * so it applies uniformly to all three source branches.
 */
export function buildEffectiveMaterialsWhere(ctx: MaterialScopeContext): Prisma.MaterialWhereInput {
  const scopeBranches: Prisma.MaterialWhereInput[] = [
    { scope: 'GROUP', scheduledGroupId: ctx.scheduledGroupId },
  ]

  if (ctx.moduleIds.length > 0) {
    scopeBranches.push({ scope: 'MODULE', moduleId: { in: ctx.moduleIds } })
  }

  if (ctx.courseIsCustom) {
    scopeBranches.push({ scope: 'COURSE', courseId: ctx.courseId })
  }

  return {
    AND: [
      { OR: scopeBranches },
      { NOT: { hiddenInGroups: { some: { scheduledGroupId: ctx.scheduledGroupId } } } },
    ],
  }
}
