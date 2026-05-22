import { describe, expect, it } from 'vitest'
import { upsertModuleScheduleSchema } from '@/lib/validators/admin/module'

const valid = {
  moduleId: 'm1',
  schoolYear: '2026/2027',
  startDate: '2026-09-01',
  endDate: '2026-12-15',
}

describe('upsertModuleScheduleSchema', () => {
  it('accepts a full valid payload', () => {
    const result = upsertModuleScheduleSchema.parse(valid)
    expect(result.moduleId).toBe('m1')
    expect(result.schoolYear).toBe('2026/2027')
  })

  it('accepts null start/end dates (clearing)', () => {
    const result = upsertModuleScheduleSchema.parse({ ...valid, startDate: null, endDate: null })
    expect(result.startDate).toBeNull()
  })

  it('accepts omitted dates', () => {
    const result = upsertModuleScheduleSchema.parse({ moduleId: 'm1', schoolYear: '2026/2027' })
    expect(result.moduleId).toBe('m1')
  })

  it('rejects empty moduleId', () => {
    expect(upsertModuleScheduleSchema.safeParse({ ...valid, moduleId: '' }).success).toBe(false)
  })

  it('rejects a malformed school year with Croatian message', () => {
    const result = upsertModuleScheduleSchema.safeParse({ ...valid, schoolYear: '2026' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('školska godina')
    }
  })
})
