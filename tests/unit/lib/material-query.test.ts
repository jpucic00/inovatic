import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'

function scopeBranches(where: Prisma.MaterialWhereInput): Prisma.MaterialWhereInput[] {
  const and = where.AND as Prisma.MaterialWhereInput[]
  return (and[0].OR ?? []) as Prisma.MaterialWhereInput[]
}

describe('buildEffectiveMaterialsWhere', () => {
  it('always includes a COURSE branch — even for a non-custom (standard) program', () => {
    const where = buildEffectiveMaterialsWhere({
      scheduledGroupId: 'g1',
      courseId: 'c1',
      courseIsCustom: false,
      moduleIds: ['m1', 'm2'],
    })
    const branches = scopeBranches(where)
    expect(branches).toContainEqual({ scope: 'GROUP', scheduledGroupId: 'g1' })
    expect(branches).toContainEqual({ scope: 'COURSE', courseId: 'c1' })
    expect(branches).toContainEqual({ scope: 'MODULE', moduleId: { in: ['m1', 'm2'] } })
  })

  it('includes COURSE for a radionica and omits the MODULE branch when no modules', () => {
    const where = buildEffectiveMaterialsWhere({
      scheduledGroupId: 'g1',
      courseId: 'c1',
      courseIsCustom: true,
      moduleIds: [],
    })
    const branches = scopeBranches(where)
    expect(branches).toContainEqual({ scope: 'COURSE', courseId: 'c1' })
    expect(branches.some((b) => b.scope === 'MODULE')).toBe(false)
  })

  it('excludes materials hidden for this group via MaterialGroupHide', () => {
    const where = buildEffectiveMaterialsWhere({
      scheduledGroupId: 'g1',
      courseId: 'c1',
      courseIsCustom: false,
      moduleIds: [],
    })
    const and = where.AND as Prisma.MaterialWhereInput[]
    expect(and[1]).toEqual({
      NOT: { hiddenInGroups: { some: { scheduledGroupId: 'g1' } } },
    })
  })
})
