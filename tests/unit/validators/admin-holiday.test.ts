import { describe, expect, it } from 'vitest'
import { bulkImportHolidaysSchema } from '@/lib/validators/admin/holiday'

describe('bulkImportHolidaysSchema', () => {
  it('accepts a mix of single + range items', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [
        { kind: 'single', date: '2025-12-25', name: 'Božić' },
        {
          kind: 'range',
          startDate: '2025-12-24',
          endDate: '2026-01-09',
          name: 'Zimski odmor',
        },
      ],
    })
    expect(res.success).toBe(true)
  })

  it('rejects an empty items array', () => {
    const res = bulkImportHolidaysSchema.safeParse({ schoolYear: '2025/2026', items: [] })
    expect(res.success).toBe(false)
  })

  it('rejects a malformed school year label', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '25/26',
      items: [{ kind: 'single', date: '2025-12-25', name: 'Božić' }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects a single item with a malformed date', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'single', date: '25-12-2025', name: 'Božić' }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects a range where endDate is before startDate', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [
        { kind: 'range', startDate: '2026-01-09', endDate: '2025-12-24', name: 'Zimski' },
      ],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      const msg = res.error.issues[0]?.message ?? ''
      expect(msg).toMatch(/isti ili nakon početka/i)
    }
  })

  it('rejects an item whose name is empty after trimming', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'single', date: '2025-12-25', name: '   ' }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects an unknown discriminator value', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'weekend', date: '2025-12-25', name: 'X' }],
    })
    expect(res.success).toBe(false)
  })

  it('accepts confirmDeleteAttendance as a boolean', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'single', date: '2025-12-25', name: 'Božić' }],
      confirmDeleteAttendance: true,
    })
    expect(res.success).toBe(true)
  })
})
