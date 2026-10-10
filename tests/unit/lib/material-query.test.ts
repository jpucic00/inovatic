import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import {
  buildEffectiveMaterialsWhere,
  visibleLessonWhere,
  type MaterialViewer,
} from '@/lib/material-query'

function andOf(where: Prisma.MaterialWhereInput): Prisma.MaterialWhereInput[] {
  return where.AND as Prisma.MaterialWhereInput[]
}

function scopeBranches(where: Prisma.MaterialWhereInput): Prisma.MaterialWhereInput[] {
  return (andOf(where)[0].OR ?? []) as Prisma.MaterialWhereInput[]
}

function build(viewer: MaterialViewer, moduleIds: string[] = ['m1', 'm2']) {
  return buildEffectiveMaterialsWhere({ scheduledGroupId: 'g1', courseId: 'c1', moduleIds, viewer, city: 'SPLIT' })
}

const LESSON_IN_VIEW = {
  courseId: 'c1',
  moduleId: { in: ['m1', 'm2'] },
}

describe('visibleLessonWhere', () => {
  it('admits only the lessons of the given modules', () => {
    expect(visibleLessonWhere('c1', ['m1', 'm2'])).toEqual(LESSON_IN_VIEW)
  })

  it('admits only module-less lessons when no module is in view', () => {
    expect(visibleLessonWhere('c1', [])).toEqual({ courseId: 'c1', moduleId: null })
  })
})

describe('buildEffectiveMaterialsWhere — STUDENT', () => {
  it('filters to the STUDENT audience', () => {
    expect(andOf(build('STUDENT'))).toContainEqual({ audience: 'STUDENT' })
  })

  it('has only the LESSON and GROUP branches — never the teacher-only COURSE/MODULE rows', () => {
    const branches = scopeBranches(build('STUDENT'))
    expect(branches.map((b) => b.scope)).toEqual(['LESSON', 'GROUP'])
  })

  it('reads lesson materials only from lessons in view', () => {
    expect(scopeBranches(build('STUDENT'))).toContainEqual({ scope: 'LESSON', lesson: LESSON_IN_VIEW })
  })
})

describe('buildEffectiveMaterialsWhere — STAFF', () => {
  it('adds the COURSE and MODULE branches', () => {
    const branches = scopeBranches(build('STAFF'))
    expect(branches).toContainEqual({ scope: 'COURSE', courseId: 'c1' })
    expect(branches).toContainEqual({ scope: 'MODULE', moduleId: { in: ['m1', 'm2'] } })
    expect(branches.map((b) => b.scope)).toEqual(['LESSON', 'GROUP', 'COURSE', 'MODULE'])
  })

  it('applies no audience filter', () => {
    const and = andOf(build('STAFF'))
    expect(and.some((clause) => 'audience' in clause)).toBe(false)
    expect(JSON.stringify(build('STAFF'))).not.toContain('audience')
  })
})

describe('buildEffectiveMaterialsWhere — shared rules', () => {
  it.each<MaterialViewer>(['STUDENT', 'STAFF'])(
    '%s: GROUP branch is this group only, and inside a lesson in view',
    (viewer) => {
      expect(scopeBranches(build(viewer))).toContainEqual({
        scope: 'GROUP',
        scheduledGroupId: 'g1',
        lesson: LESSON_IN_VIEW,
      })
    },
  )

  it.each<MaterialViewer>(['STUDENT', 'STAFF'])(
    '%s: excludes materials hidden for this group via MaterialGroupHide',
    (viewer) => {
      expect(andOf(build(viewer))).toContainEqual({
        NOT: { hiddenInGroups: { some: { scheduledGroupId: 'g1' } } },
      })
    },
  )

  it.each<MaterialViewer>(['STUDENT', 'STAFF'])(
    '%s: with no modules in view, lessons are module-less only and there is no MODULE branch',
    (viewer) => {
      const branches = scopeBranches(build(viewer, []))
      const radionicaLesson = { courseId: 'c1', moduleId: null }
      expect(branches).toContainEqual({ scope: 'LESSON', lesson: radionicaLesson })
      expect(branches).toContainEqual({ scope: 'GROUP', scheduledGroupId: 'g1', lesson: radionicaLesson })
      expect(branches.some((b) => b.scope === 'MODULE')).toBe(false)
    },
  )

  it.each<MaterialViewer>(['STUDENT', 'STAFF'])(
    '%s: drops materials limited to the other city, keeps shared and own-city ones',
    (viewer) => {
      expect(andOf(build(viewer))).toContainEqual({ OR: [{ city: null }, { city: 'SPLIT' }] })
    },
  )

  it('STAFF keeps the COURSE branch for a radionica with no modules', () => {
    expect(scopeBranches(build('STAFF', []))).toContainEqual({ scope: 'COURSE', courseId: 'c1' })
  })
})
