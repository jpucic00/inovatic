import { describe, expect, it } from 'vitest'
import {
  bulkImportHolidaysSchema,
  upsertHolidayRangeSchema,
  upsertHolidaySchema,
} from '@/lib/validators/admin/holiday'

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

  it('rejects an impossible calendar date', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'single', date: '2026-02-31', name: 'Nepostojeći' }],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => /ne postoji u kalendaru/i.test(i.message))).toBe(true)
    }
  })

  it('rejects a date outside the school-year window', () => {
    // 2026-09-15 belongs to 2026/2027, not 2025/2026 (which ends 2026-08-31).
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'single', date: '2026-09-15', name: 'Izvan godine' }],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(
        res.error.issues.some((i) => /unutar odabrane školske godine/i.test(i.message)),
      ).toBe(true)
    }
  })

  it('rejects a range longer than 366 days', () => {
    const res = bulkImportHolidaysSchema.safeParse({
      schoolYear: '2025/2026',
      items: [{ kind: 'range', startDate: '2025-09-01', endDate: '2027-09-05', name: 'Predugačko' }],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => /dulji od 366 dana/i.test(i.message))).toBe(true)
    }
  })
})

describe('upsertHolidaySchema', () => {
  it('accepts an in-window real date', () => {
    expect(
      upsertHolidaySchema.safeParse({ schoolYear: '2025/2026', date: '2025-12-25', name: 'Božić' })
        .success,
    ).toBe(true)
  })

  it('rejects an impossible calendar date', () => {
    const res = upsertHolidaySchema.safeParse({ schoolYear: '2025/2026', date: '2026-02-31' })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/ne postoji u kalendaru/i)
    }
  })

  it('rejects a date outside the school-year window', () => {
    const res = upsertHolidaySchema.safeParse({ schoolYear: '2025/2026', date: '2026-09-15' })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/unutar odabrane školske godine/i)
    }
  })
})

describe('upsertHolidayRangeSchema', () => {
  it('accepts a normal in-window range', () => {
    expect(
      upsertHolidayRangeSchema.safeParse({
        schoolYear: '2025/2026',
        startDate: '2025-12-24',
        endDate: '2026-01-09',
        name: 'Zimski odmor',
      }).success,
    ).toBe(true)
  })

  it('rejects a range longer than 366 days', () => {
    const res = upsertHolidayRangeSchema.safeParse({
      schoolYear: '2025/2026',
      startDate: '2025-09-01',
      endDate: '2027-09-05',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => /dulji od 366 dana/i.test(i.message))).toBe(true)
    }
  })
})
