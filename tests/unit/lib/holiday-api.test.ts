import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dateRangeForSchoolYear,
  fetchCroatianHolidays,
  HolidayApiError,
} from '@/lib/holiday-api'

const PUBLIC_2025 = [
  {
    id: 'p1',
    startDate: '2025-11-01',
    endDate: '2025-11-01',
    type: 'Public',
    name: [
      { language: 'HR', text: 'Svi sveti' },
      { language: 'EN', text: "All Saints' Day" },
    ],
  },
  {
    id: 'p2',
    startDate: '2025-12-25',
    endDate: '2025-12-25',
    type: 'Public',
    name: [{ language: 'HR', text: 'Božić' }],
  },
  {
    id: 'p3',
    startDate: '2026-01-01',
    endDate: '2026-01-01',
    type: 'Public',
    name: [{ language: 'HR', text: 'Nova Godina' }],
  },
]

const SCHOOL_2025 = [
  {
    id: 's1',
    startDate: '2025-12-24',
    endDate: '2026-01-09',
    type: 'School',
    name: [{ language: 'HR', text: 'Zimski odmor' }],
  },
  {
    id: 's2',
    startDate: '2026-03-30',
    endDate: '2026-04-06',
    type: 'School',
    name: [{ language: 'HR', text: 'Proljetni odmor' }],
  },
]

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dateRangeForSchoolYear', () => {
  it('maps "2025/2026" to Sept 1 2025 – Aug 31 2026', () => {
    expect(dateRangeForSchoolYear('2025/2026')).toEqual({
      validFrom: '2025-09-01',
      validTo: '2026-08-31',
    })
  })

  it('throws HolidayApiError on a malformed label', () => {
    expect(() => dateRangeForSchoolYear('bad')).toThrow(HolidayApiError)
  })
})

describe('fetchCroatianHolidays', () => {
  it('merges public + school responses, splits single vs range, picks HR names', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const s = String(url)
      if (s.includes('/PublicHolidays')) return jsonResponse(PUBLIC_2025)
      if (s.includes('/SchoolHolidays')) return jsonResponse(SCHOOL_2025)
      throw new Error(`Unexpected URL ${s}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await fetchCroatianHolidays('2025/2026')

    // Public first, then school; both in date order.
    expect(items).toEqual([
      { kind: 'single', date: '2025-11-01', name: 'Svi sveti', category: 'public' },
      { kind: 'single', date: '2025-12-25', name: 'Božić', category: 'public' },
      { kind: 'single', date: '2026-01-01', name: 'Nova Godina', category: 'public' },
      {
        kind: 'range',
        startDate: '2025-12-24',
        endDate: '2026-01-09',
        name: 'Zimski odmor',
        category: 'school',
      },
      {
        kind: 'range',
        startDate: '2026-03-30',
        endDate: '2026-04-06',
        name: 'Proljetni odmor',
        category: 'school',
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('countryIsoCode=HR'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('languageIsoCode=HR'))).toBe(true)
    // Should request the Sept-1 → Aug-31 window for the school year.
    expect(calledUrls.every((u) => u.includes('validFrom=2025-09-01'))).toBe(true)
    expect(calledUrls.every((u) => u.includes('validTo=2026-08-31'))).toBe(true)
  })

  it('correctly handles a school year that spans the Dec/Jan year boundary', async () => {
    // Year-boundary case: Zimski odmor crosses 2025 → 2026.
    const fetchMock = vi.fn(async (url: string | URL) => {
      const s = String(url)
      if (s.includes('/PublicHolidays')) return jsonResponse([])
      if (s.includes('/SchoolHolidays')) return jsonResponse([SCHOOL_2025[0]])
      throw new Error(`Unexpected URL ${s}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await fetchCroatianHolidays('2025/2026')
    expect(items).toEqual([
      {
        kind: 'range',
        startDate: '2025-12-24',
        endDate: '2026-01-09',
        name: 'Zimski odmor',
        category: 'school',
      },
    ])
  })

  it('falls back to the first available name if no Croatian translation is present', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const s = String(url)
      if (s.includes('/PublicHolidays'))
        return jsonResponse([
          {
            startDate: '2025-12-25',
            endDate: '2025-12-25',
            name: [{ language: 'EN', text: 'Christmas Day' }],
          },
        ])
      if (s.includes('/SchoolHolidays')) return jsonResponse([])
      throw new Error('unexpected')
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await fetchCroatianHolidays('2025/2026')
    expect(items[0]).toMatchObject({ name: 'Christmas Day' })
  })

  it('skips entries with no name or no dates', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const s = String(url)
      if (s.includes('/PublicHolidays'))
        return jsonResponse([
          { startDate: '2025-12-25', endDate: '2025-12-25' }, // no name
          {
            startDate: '',
            endDate: '',
            name: [{ language: 'HR', text: 'Nepoznato' }],
          }, // no date
          {
            startDate: '2025-12-25',
            endDate: '2025-12-25',
            name: [{ language: 'HR', text: 'Božić' }],
          },
        ])
      if (s.includes('/SchoolHolidays')) return jsonResponse([])
      throw new Error('unexpected')
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await fetchCroatianHolidays('2025/2026')
    expect(items).toEqual([
      { kind: 'single', date: '2025-12-25', name: 'Božić', category: 'public' },
    ])
  })

  it('throws HolidayApiError when the API returns a non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response('Server error', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCroatianHolidays('2025/2026')).rejects.toBeInstanceOf(HolidayApiError)
  })

  it('throws HolidayApiError on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    await expect(fetchCroatianHolidays('2025/2026')).rejects.toBeInstanceOf(HolidayApiError)
  })

  it('throws HolidayApiError when the response is not a JSON array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ unexpected: 'shape' })),
    )

    await expect(fetchCroatianHolidays('2025/2026')).rejects.toBeInstanceOf(HolidayApiError)
  })
})
