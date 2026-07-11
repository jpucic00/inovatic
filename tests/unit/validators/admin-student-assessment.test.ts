import { describe, expect, it } from 'vitest'
import { upsertAssessmentSchema } from '@/lib/validators/admin/student-assessment'

const base = { studentId: 's1', groupId: 'g1' }
const ok = (input: unknown) => upsertAssessmentSchema.safeParse(input).success

describe('upsertAssessmentSchema', () => {
  it('accepts an empty (all-null) card', () => {
    expect(ok(base)).toBe(true)
  })

  it('accepts valid skill levels', () => {
    expect(ok({ ...base, slaganje: 'OSTVARENO', zabava: 'POCETNO' })).toBe(true)
  })

  it('rejects an invalid skill level', () => {
    expect(ok({ ...base, slaganje: 'BOGUS' })).toBe(false)
  })

  it('requires a courseId when kind is COURSE', () => {
    expect(ok({ ...base, recommendationKind: 'COURSE' })).toBe(false)
    expect(ok({ ...base, recommendationKind: 'COURSE', recommendedCourseId: 'c1' })).toBe(
      true,
    )
  })

  it('rejects a courseId paired with a competition kind', () => {
    expect(
      ok({ ...base, recommendationKind: 'COMPETITION_PREP', recommendedCourseId: 'c1' }),
    ).toBe(false)
  })

  it('accepts competition kinds without a courseId', () => {
    expect(ok({ ...base, recommendationKind: 'COMPETITION_PROGRAM' })).toBe(true)
  })

  it('rejects a courseId with no kind', () => {
    expect(ok({ ...base, recommendedCourseId: 'c1' })).toBe(false)
  })

  it('rejects opisnaOcjena over 5000 chars', () => {
    expect(ok({ ...base, opisnaOcjena: 'x'.repeat(5001) })).toBe(false)
    expect(ok({ ...base, opisnaOcjena: 'x'.repeat(5000) })).toBe(true)
  })

  it('rejects a missing groupId or studentId', () => {
    expect(ok({ studentId: 's1' })).toBe(false)
    expect(ok({ groupId: 'g1' })).toBe(false)
  })
})
