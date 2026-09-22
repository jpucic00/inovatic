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
        { kind: 'custom', expectedSessions: ['2026-10-01', '2026-10-02'], extraSessions: [] },
        '2026-09-29',
      ),
    ).toEqual([{ title: 'Termini', dates: ['2026-10-01', '2026-10-02'] }])
  })
})
