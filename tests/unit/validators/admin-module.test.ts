import { describe, expect, it } from 'vitest'
import { updateModuleSchema } from '@/lib/validators/admin/module'

describe('updateModuleSchema', () => {
  it('accepts id-only update', () => {
    expect(updateModuleSchema.parse({ id: 'm1' }).id).toBe('m1')
  })

  it('accepts full update', () => {
    const result = updateModuleSchema.parse({
      id: 'm1',
      title: 'Modul 1',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
    })
    expect(result.title).toBe('Modul 1')
  })

  it('accepts null startDate/endDate (clearing)', () => {
    const result = updateModuleSchema.parse({ id: 'm1', startDate: null, endDate: null })
    expect(result.startDate).toBeNull()
  })

  it('rejects empty id', () => {
    expect(updateModuleSchema.safeParse({ id: '' }).success).toBe(false)
  })

  it('rejects title shorter than 2 chars with Croatian message', () => {
    const result = updateModuleSchema.safeParse({ id: 'm1', title: 'M' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('najmanje 2 znaka')
    }
  })
})
