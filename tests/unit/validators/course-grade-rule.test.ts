import { describe, expect, it } from 'vitest'
import {
  resetCourseGradeRuleSchema,
  upsertCourseGradeRuleSchema,
} from '@/lib/validators/admin/course-grade-rule'

const base = { courseId: 'course-1', schoolYear: '2026/2027' }

describe('upsertCourseGradeRuleSchema', () => {
  it('accepts a razred list', () => {
    const result = upsertCourseGradeRuleSchema.safeParse({
      ...base,
      grades: ['5', '6', '7', '8'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts an EMPTY list — that is "offered to nobody", not a missing answer', () => {
    expect(upsertCourseGradeRuleSchema.safeParse({ ...base, grades: [] }).success).toBe(true)
  })

  it('accepts predškolci', () => {
    expect(
      upsertCourseGradeRuleSchema.safeParse({ ...base, grades: ['predskolci'] }).success,
    ).toBe(true)
  })

  it('rejects a srednja škola razred — the razred rule is osnovna škola only', () => {
    expect(upsertCourseGradeRuleSchema.safeParse({ ...base, grades: ['ss1'] }).success).toBe(false)
  })

  it('rejects an unknown razred', () => {
    expect(
      upsertCourseGradeRuleSchema.safeParse({ ...base, grades: ['9'] }).success,
    ).toBe(false)
  })

  it('rejects a razred listed twice', () => {
    expect(
      upsertCourseGradeRuleSchema.safeParse({ ...base, grades: ['5', '5'] }).success,
    ).toBe(false)
  })

  it('rejects a malformed school year', () => {
    expect(
      upsertCourseGradeRuleSchema.safeParse({ ...base, schoolYear: '2026', grades: [] }).success,
    ).toBe(false)
  })

  it('rejects an empty courseId', () => {
    expect(
      upsertCourseGradeRuleSchema.safeParse({ ...base, courseId: '', grades: [] }).success,
    ).toBe(false)
  })
})

describe('resetCourseGradeRuleSchema', () => {
  it('needs only the course and the year', () => {
    expect(resetCourseGradeRuleSchema.safeParse(base).success).toBe(true)
  })

  it('still validates the school year', () => {
    expect(
      resetCourseGradeRuleSchema.safeParse({ ...base, schoolYear: 'lani' }).success,
    ).toBe(false)
  })
})
