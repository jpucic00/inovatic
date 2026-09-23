import { describe, expect, it } from 'vitest'
import {
  effectiveStaffFor,
  sessionTeacherRows,
  staffChangeAccessFrom,
  staffChangeDateError,
  staffChangeLabel,
  staffDisplayNames,
  upcomingTerminSections,
  type StaffChange,
} from '@/lib/session-staff'

const IVO = { userId: 'ivo', name: 'Ivo Horvat', role: 'LEAD' as const }
const ANA = { userId: 'ana', name: 'Ana Kovač', role: 'ASSISTANT' as const }
const DAY = '2026-10-13'

const change = (over: Partial<StaffChange>): StaffChange => ({
  sessionDate: DAY,
  userId: 'marko',
  name: 'Marko Marić',
  role: 'LEAD',
  replacesUserId: null,
  replacesName: null,
  ...over,
})

describe('effectiveStaffFor', () => {
  it('is the regular staff, predavač first, when nothing changed', () => {
    expect(effectiveStaffFor([ANA, IVO], [], DAY).map((s) => s.userId)).toEqual(['ivo', 'ana'])
  })

  it('swaps a substitute in for the teacher they replace', () => {
    const staff = effectiveStaffFor(
      [IVO, ANA],
      [change({ replacesUserId: 'ivo', replacesName: 'Ivo Horvat' })],
      DAY,
    )
    expect(staff.map((s) => s.userId)).toEqual(['marko', 'ana'])
    expect(staff[0]).toMatchObject({ isChange: true, isRegular: false, replacesName: 'Ivo Horvat' })
  })

  it('applies a change to its own date and no other — the "sutradan" rule', () => {
    const changes = [change({ replacesUserId: 'ivo', replacesName: 'Ivo Horvat' })]
    expect(effectiveStaffFor([IVO], changes, '2026-10-20').map((s) => s.userId)).toEqual(['ivo'])
  })

  it('adds an extra person without removing anyone', () => {
    const staff = effectiveStaffFor([IVO], [change({ role: 'ASSISTANT' })], DAY)
    expect(staff.map((s) => [s.userId, s.role])).toEqual([
      ['ivo', 'LEAD'],
      ['marko', 'ASSISTANT'],
    ])
  })

  it('swaps two substitutes in for two regulars on the same date', () => {
    const staff = effectiveStaffFor(
      [IVO, ANA],
      [
        change({ replacesUserId: 'ivo', replacesName: 'Ivo Horvat' }),
        change({
          userId: 'petra',
          name: 'Petra Perić',
          role: 'ASSISTANT',
          replacesUserId: 'ana',
          replacesName: 'Ana Kovač',
        }),
      ],
      DAY,
    )
    expect(staff.map((s) => [s.userId, s.role, s.replacesUserId])).toEqual([
      ['marko', 'LEAD', 'ivo'],
      ['petra', 'ASSISTANT', 'ana'],
    ])
    expect(staff.every((s) => s.isChange && !s.isRegular)).toBe(true)
  })

  it('lists a regular with a different role for the day once, with that role', () => {
    const staff = effectiveStaffFor(
      [IVO, ANA],
      [change({ userId: 'ana', name: 'Ana Kovač', role: 'LEAD', replacesUserId: 'ivo', replacesName: 'Ivo Horvat' })],
      DAY,
    )
    expect(staff).toHaveLength(1)
    expect(staff[0]).toMatchObject({ userId: 'ana', role: 'LEAD', isRegular: true })
  })
})

describe('staffChangeLabel', () => {
  it('names who is replaced, or why the person is there', () => {
    expect(staffChangeLabel({ replacesName: 'Ivo Horvat', isRegular: false })).toBe(
      'Zamjena · umjesto: Ivo Horvat',
    )
    expect(staffChangeLabel({ replacesName: null, isRegular: false })).toBe('Dodatno na terminu')
    expect(staffChangeLabel({ replacesName: null, isRegular: true })).toBe('Uloga samo na ovom terminu')
  })
})

describe('sessionTeacherRows', () => {
  it('keeps the replaced teacher as a non-bookable row', () => {
    const rows = sessionTeacherRows(
      [IVO],
      [change({ replacesUserId: 'ivo', replacesName: 'Ivo Horvat' })],
      DAY,
      [{ userId: 'ivo', name: 'Ivo Horvat' }, { userId: 'marko', name: 'Marko Marić' }],
    )
    expect(rows.map((r) => [r.userId, r.assigned])).toEqual([
      ['marko', true],
      ['ivo', false],
    ])
  })
})

describe('staffChangeAccessFrom', () => {
  it('is the Zagreb calendar day, not the UTC one', () => {
    // 23:30 UTC on the 12th is already the 13th in Zagreb (CEST).
    expect(staffChangeAccessFrom(new Date('2026-10-12T23:30:00Z')).toISOString()).toBe(
      '2026-10-13T00:00:00.000Z',
    )
  })

  it('is the Zagreb calendar day in winter time too (CET, UTC+1)', () => {
    // 23:30 UTC on 14 Dec is 00:30 on the 15th in Zagreb.
    expect(staffChangeAccessFrom(new Date('2026-12-14T23:30:00Z')).toISOString()).toBe(
      '2026-12-15T00:00:00.000Z',
    )
    // 22:30 UTC is still 23:30 on the 14th: an offset of +2 would wrongly roll it over.
    expect(staffChangeAccessFrom(new Date('2026-12-14T22:30:00Z')).toISOString()).toBe(
      '2026-12-14T00:00:00.000Z',
    )
  })
})

describe('staffChangeDateError', () => {
  const weekly = { dayOfWeek: 'Utorak', dateStart: null, dateEnd: null }
  it('accepts the group weekday and refuses any other', () => {
    expect(staffChangeDateError(weekly, '2026-10-13', new Set())).toBeNull()
    expect(staffChangeDateError(weekly, '2026-10-14', new Set())).toMatch(/Utorak/)
  })
  it('refuses a holiday', () => {
    expect(staffChangeDateError(weekly, '2026-10-13', new Set(['2026-10-13']))).toMatch(/praznik/)
  })
  it('bounds a radionica by its range', () => {
    const radionica = { dayOfWeek: null, dateStart: '2026-10-12', dateEnd: '2026-10-16' }
    expect(staffChangeDateError(radionica, '2026-10-14', new Set())).toBeNull()
    expect(staffChangeDateError(radionica, '2026-10-17', new Set())).toMatch(/završetka/)
  })
  it('refuses every date for a group with neither a weekday nor a date range', () => {
    const blank = { dayOfWeek: null, dateStart: null, dateEnd: null }
    expect(staffChangeDateError(blank, '2026-10-13', new Set())).toBe('Grupa nema zadan dan održavanja.')
  })
})

describe('staffDisplayNames', () => {
  it('orders predavači first and marks asistenti', () => {
    expect(staffDisplayNames([ANA, IVO])).toEqual(['Ivo Horvat', 'Ana Kovač (asistent)'])
  })
})

describe('upcomingTerminSections', () => {
  it('groups a standard group by module like Dolazak and drops past termini', () => {
    const sections = upcomingTerminSections(
      {
        schoolYear: '2026/2027',
        kind: 'standard',
        sections: [
          { moduleIndex: 0, moduleTitle: 'Probni sat', expectedSessions: ['2026-09-01'], adhocSessions: [] },
          {
            moduleIndex: 1,
            moduleTitle: 'Zabavni sustavi',
            expectedSessions: ['2026-09-08', '2026-09-29', '2026-10-06'],
            adhocSessions: ['2026-09-30'],
          },
        ],
        otherDates: [],
      },
      '2026-09-29',
    )
    expect(sections).toEqual([
      { title: 'Modul 1: Zabavni sustavi', dates: ['2026-09-29', '2026-09-30', '2026-10-06'] },
    ])
  })

  it('lists a radionica as one block', () => {
    expect(
      upcomingTerminSections(
        { schoolYear: '2026/2027', kind: 'custom', expectedSessions: ['2026-10-01', '2026-10-02'], extraSessions: [] },
        '2026-09-29',
      ),
    ).toEqual([{ title: 'Termini', dates: ['2026-10-01', '2026-10-02'] }])
  })

  it('emits Ostali termini and lists a date named twice only once', () => {
    const sections = upcomingTerminSections(
      {
        schoolYear: '2026/2027',
        kind: 'standard',
        sections: [
          {
            moduleIndex: 1,
            moduleTitle: 'Zabavni sustavi',
            expectedSessions: ['2026-10-06', '2026-10-13'],
            adhocSessions: ['2026-10-13'],
          },
        ],
        otherDates: ['2026-11-04', '2026-09-01', '2026-11-04'],
      },
      '2026-09-29',
    )
    expect(sections).toEqual([
      { title: 'Modul 1: Zabavni sustavi', dates: ['2026-10-06', '2026-10-13'] },
      { title: 'Ostali termini', dates: ['2026-11-04'] },
    ])
  })

  it("drops a date outside the group's own school year, as the action refuses it", () => {
    // A radionica stamped 2026/2027 whose run starts in August 2026.
    expect(
      upcomingTerminSections(
        {
          schoolYear: '2026/2027',
          kind: 'custom',
          expectedSessions: ['2026-08-28', '2026-08-31', '2026-09-01'],
          extraSessions: [],
        },
        '2026-08-20',
      ),
    ).toEqual([{ title: 'Termini', dates: ['2026-09-01'] }])
  })

  it('drops a section left with no date in the school year', () => {
    expect(
      upcomingTerminSections(
        { schoolYear: '2026/2027', kind: 'custom', expectedSessions: ['2026-08-31'], extraSessions: [] },
        '2026-08-20',
      ),
    ).toEqual([])
  })

  it('de-duplicates a radionica date listed as expected and extra', () => {
    expect(
      upcomingTerminSections(
        { schoolYear: '2026/2027', kind: 'custom', expectedSessions: ['2026-10-01'], extraSessions: ['2026-10-01', '2026-10-03'] },
        '2026-09-29',
      ),
    ).toEqual([{ title: 'Termini', dates: ['2026-10-01', '2026-10-03'] }])
  })
})
