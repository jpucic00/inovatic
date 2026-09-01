import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AttendanceMarker } from '@/components/teacher/attendance-marker'
import { bulkMarkSession } from '@/actions/teacher/attendance'
import type { GroupAttendance } from '@/actions/teacher/attendance'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/teacher/attendance', () => ({
  bulkMarkSession: vi.fn(async () => ({ success: true as const })),
}))

const ANA = { enrollmentId: 'e-1', studentId: 's-1', firstName: 'Ana', lastName: 'Anić' }
const LUKA = { enrollmentId: 'e-2', studentId: 's-2', firstName: 'Luka', lastName: 'Babić' }

// Long past, so `pickFlatDefault` deterministically lands on the last date
// rather than on "today" — the marker picks the newest session already held.
const SESSIONS = ['2020-01-06', '2020-01-07', '2020-01-08']
const SELECTED = '2020-01-08'

function props(records: GroupAttendance['records'] = []): GroupAttendance {
  return {
    kind: 'custom',
    groupId: 'g-1',
    schoolYear: '2025/2026',
    dayOfWeek: null,
    dateStart: '2020-01-06',
    dateEnd: '2020-01-08',
    startTime: '10:00',
    endTime: '13:00',
    expectedSessions: SESSIONS,
    extraSessions: [],
    roster: [ANA, LUKA],
    records,
    teachers: [],
    teacherRecords: [],
    // null = admin: never outside the marking window, so nothing is read-only.
    markingWindow: null,
  }
}

function record(enrollmentId: string, present: boolean) {
  return {
    enrollmentId,
    sessionDate: SELECTED,
    present,
    note: null,
    recordedBy: 'Petra Novak',
    recordedByDeleted: false,
    recordedAt: '2020-01-08T17:42:00.000Z',
  }
}

const box = (name: RegExp | string) => screen.getByRole('checkbox', { name })
const markAll = () => screen.getByRole('checkbox', { name: /Označi sve prisutne/ })
const clearAll = () => screen.getByRole('checkbox', { name: /Poništi sve oznake/ })
const saveButton = () => screen.getByRole('button', { name: /Spremi evidenciju/ })

beforeEach(() => {
  vi.mocked(bulkMarkSession).mockClear()
})

describe('AttendanceMarker — blank draft', () => {
  // The bug the redesign exists to fix: an untouched session used to render as
  // a full column of green "Prisutan", indistinguishable from a saved one.
  it('opens a session with no records unmarked and says so', () => {
    render(<AttendanceMarker {...props()} />)

    expect(box(/Anić/).getAttribute('aria-checked')).toBe('false')
    expect(box(/Babić/).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/Nije evidentirano/)).toBeTruthy()
    expect(screen.getByText('0 / 2 prisutno')).toBeTruthy()
  })

  it('does not claim "Odsutan" for a student who is merely unmarked', () => {
    render(<AttendanceMarker {...props()} />)
    expect(screen.queryByText('Odsutan')).toBeNull()
  })
})

describe('AttendanceMarker — mark all', () => {
  it('fills the whole roster in one click and flips to the clear label', () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(markAll())

    expect(box(/Anić/).getAttribute('aria-checked')).toBe('true')
    expect(box(/Babić/).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('2 / 2 prisutno')).toBeTruthy()
    expect(clearAll()).toBeTruthy()
  })

  it('clears the whole roster on the second click', () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(markAll())
    fireEvent.click(clearAll())

    expect(box(/Anić/).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('0 / 2 prisutno')).toBeTruthy()
  })

  // Partial → all, so a teacher who ticked a few can still finish in one click.
  it('reads mixed with a partial roster and fills the rest', () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(box(/Anić/))
    expect(markAll().getAttribute('aria-checked')).toBe('mixed')

    fireEvent.click(markAll())
    expect(box(/Babić/).getAttribute('aria-checked')).toBe('true')
  })

  it('announces unsaved changes as soon as a box is ticked', () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(box(/Anić/))

    expect(screen.getByText(/Nespremljene izmjene — 1 od 2 označeno/)).toBeTruthy()
  })
})

describe('AttendanceMarker — a recorded session', () => {
  const recorded = props([record('e-1', true), record('e-2', false)])

  it('mirrors the record and reports when it was saved', () => {
    render(<AttendanceMarker {...recorded} />)

    expect(box(/Anić/).getAttribute('aria-checked')).toBe('true')
    expect(box(/Babić/).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/Evidentirano · 1 od 2 prisutno/)).toBeTruthy()
  })

  // Only after a save does an empty box mean "absent" rather than "unanswered".
  it('labels the recorded absence', () => {
    render(<AttendanceMarker {...recorded} />)
    expect(screen.getByText('Odsutan')).toBeTruthy()
  })

  it('leaves Spremi inert until something actually changes', () => {
    render(<AttendanceMarker {...recorded} />)

    expect(screen.getByRole('button', { name: /Spremljeno/ }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(box(/Babić/))
    expect(saveButton().hasAttribute('disabled')).toBe(false)
  })

  // A student enrolled AFTER the session was saved has no row and rests at the
  // blank baseline, so their missing row can never look like an edit. Save must
  // stay enabled on such a session, or that row could never be written at all.
  it('keeps Spremi live while one roster member has no row, and writes it', async () => {
    render(<AttendanceMarker {...props([record('e-1', true)])} />)

    const save = saveButton()
    expect(save.hasAttribute('disabled')).toBe(false)

    fireEvent.click(save)
    // Ana's record keeps one box ticked, so no all-absent confirmation fires.
    expect(screen.queryByText('Spremiti bez ijednog prisutnog?')).toBeNull()

    await waitFor(() => expect(bulkMarkSession).toHaveBeenCalledTimes(1))
    expect(vi.mocked(bulkMarkSession).mock.calls[0][0]).toMatchObject({
      entries: [
        { enrollmentId: 'e-1', present: true },
        { enrollmentId: 'e-2', present: false },
      ],
    })
  })
})

describe('AttendanceMarker — saving nothing', () => {
  // The risk the blank default introduces: one click would write the whole
  // roster absent, so this is the one save that has to ask first.
  it('asks before recording everyone as absent', async () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(saveButton())

    expect(screen.getByText('Spremiti bez ijednog prisutnog?')).toBeTruthy()
    expect(bulkMarkSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Evidentiraj kao odsutne' }))

    await waitFor(() => expect(bulkMarkSession).toHaveBeenCalledTimes(1))
    expect(vi.mocked(bulkMarkSession).mock.calls[0][0]).toMatchObject({
      groupId: 'g-1',
      sessionDate: SELECTED,
      entries: [
        { enrollmentId: 'e-1', present: false },
        { enrollmentId: 'e-2', present: false },
      ],
    })
  })

  it('saves straight away once somebody is marked', async () => {
    render(<AttendanceMarker {...props()} />)

    fireEvent.click(markAll())
    fireEvent.click(saveButton())

    expect(screen.queryByText('Spremiti bez ijednog prisutnog?')).toBeNull()
    await waitFor(() => expect(bulkMarkSession).toHaveBeenCalledTimes(1))
  })
})
