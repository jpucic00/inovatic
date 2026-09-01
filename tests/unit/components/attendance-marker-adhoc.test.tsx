import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AttendanceMarker } from '@/components/teacher/attendance-marker'
import type { GroupAttendance } from '@/actions/teacher/attendance'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/teacher/attendance', () => ({ bulkMarkSession: vi.fn() }))

const ROSTER = [
  { enrollmentId: 'e-1', studentId: 's-1', firstName: 'Ana', lastName: 'Anić' },
]

function flatProps(
  overrides: Partial<Extract<GroupAttendance, { kind: 'custom' | 'season' }>> = {},
): GroupAttendance {
  return {
    kind: 'custom',
    groupId: 'g-flat',
    schoolYear: '2025/2026',
    dayOfWeek: null,
    dateStart: '2026-07-06',
    dateEnd: '2026-07-08',
    startTime: '10:00',
    endTime: '13:00',
    expectedSessions: ['2026-07-06', '2026-07-07', '2026-07-08'],
    extraSessions: [],
    roster: ROSTER,
    records: [],
    teachers: [],
    teacherRecords: [],
    markingWindow: null,
    ...overrides,
  }
}

function standardProps(
  overrides: Partial<Extract<GroupAttendance, { kind: 'standard' }>> = {},
): GroupAttendance {
  return {
    kind: 'standard',
    groupId: 'g-std',
    schoolYear: '2025/2026',
    dayOfWeek: 'PON',
    dateStart: null,
    dateEnd: null,
    startTime: '18:30',
    endTime: '20:00',
    sections: [
      {
        moduleScheduleId: 'ms-1',
        moduleId: 'm-1',
        moduleIndex: 1,
        moduleTitle: 'Prvi modul',
        expectedSessions: ['2026-01-12', '2026-01-19'],
        adhocSessions: [],
        enrolledEnrollmentIds: ['e-1'],
        firstSession: '2026-01-12',
        lastSession: '2026-01-19',
      },
    ],
    otherDates: [],
    defaultSelectedDate: '2026-01-12',
    roster: ROSTER,
    records: [],
    teachers: [],
    teacherRecords: [],
    markingWindow: null,
    ...overrides,
  }
}

function addDate(display: string) {
  fireEvent.change(screen.getByLabelText('Dodaj datum ručno'), {
    target: { value: display },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }))
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('AttendanceMarker — hand-added dates survive a remount', () => {
  it('flat branch: the date is back after unmount + remount', () => {
    const first = render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')
    expect(screen.getAllByText('15.07.2026.').length).toBeGreaterThan(0)

    // Opening Materijali unmounts the marker — the bug was losing the date here.
    first.unmount()

    render(<AttendanceMarker {...flatProps()} />)
    expect(screen.getAllByText('15.07.2026.').length).toBeGreaterThan(0)
  })

  it('flat branch: a date the server now lists is pruned from memory', () => {
    const first = render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')
    first.unmount()

    // Evidencija was saved meanwhile: the same date arrives as an extra session.
    render(
      <AttendanceMarker {...flatProps({ extraSessions: ['2026-07-15'] })} />,
    )
    // Exactly one date button in the Termini list (no duplicate from memory);
    // the header repeats the label because the date is selected.
    expect(
      screen.getAllByRole('button', { name: /15\.07\.2026\./ }),
    ).toHaveLength(1)
    // …and the memory entry is gone — the server owns the date now.
    expect(window.sessionStorage.length).toBe(0)
  })

  it('keeps memories per group', () => {
    const first = render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')
    first.unmount()

    render(
      <AttendanceMarker {...flatProps({ groupId: 'g-other-flat' })} />,
    )
    expect(screen.queryByText('15.07.2026.')).toBeNull()
  })

  // Saving evidencija does not remount — `bulkMarkSession` calls `router.refresh()`,
  // so the SAME tree receives fresh props carrying the now-real session. That is a
  // different path from the remount cases above: the draft is still in React state
  // while the effect re-reads storage, and the two have to agree on one date.
  it('flat branch: a save-triggered refresh keeps the date and drops the draft', () => {
    const { rerender } = render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')

    rerender(<AttendanceMarker {...flatProps({ extraSessions: ['2026-07-15'] })} />)

    expect(
      screen.getAllByRole('button', { name: /15\.07\.2026\./ }),
    ).toHaveLength(1)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('standard branch: a save-triggered refresh keeps the date and drops the draft', () => {
    const { rerender } = render(<AttendanceMarker {...standardProps()} />)
    addDate('26.01.2026')

    // Past module 1's last session, so the server buckets it into Ostali termini.
    rerender(<AttendanceMarker {...standardProps({ otherDates: ['2026-01-26'] })} />)

    expect(
      screen.getAllByRole('button', { name: /26\.01\.2026\./ }),
    ).toHaveLength(1)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('standard branch: the date is back after unmount + remount', () => {
    const first = render(<AttendanceMarker {...standardProps()} />)
    addDate('26.01.2026')
    expect(screen.getAllByText('26.01.2026.').length).toBeGreaterThan(0)

    first.unmount()

    render(<AttendanceMarker {...standardProps()} />)
    expect(screen.getAllByText('26.01.2026.').length).toBeGreaterThan(0)
  })
})

describe('AttendanceMarker — removing a mistyped hand-added date', () => {
  const removeButton = (label: string) =>
    screen.getByRole('button', { name: `Ukloni ručno dodani datum ${label}` })

  it('offers the × only on hand-added dates, never on server-listed ones', () => {
    render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')

    expect(removeButton('15.07.2026.')).toBeTruthy()
    // The three server-known dates are not removable from here.
    expect(
      screen.getAllByRole('button', { name: /Ukloni ručno dodani datum/ }),
    ).toHaveLength(1)
  })

  it('takes the date out of the list AND out of the per-tab memory', () => {
    const first = render(<AttendanceMarker {...flatProps()} />)
    addDate('15.07.2026')

    fireEvent.click(removeButton('15.07.2026.'))

    expect(screen.queryByText('15.07.2026.')).toBeNull()
    // The memory entry is gone too — a remount must not resurrect the typo.
    expect(window.sessionStorage.length).toBe(0)
    first.unmount()
    render(<AttendanceMarker {...flatProps()} />)
    expect(screen.queryByText('15.07.2026.')).toBeNull()
  })

  it('moves the selection off the removed date instead of stranding the panel', () => {
    render(<AttendanceMarker {...flatProps()} />)
    // addDate also selects the new date, so the panel heading shows it.
    addDate('15.07.2026')
    expect(
      screen.getByRole('heading', { level: 3, name: /15\.07\.2026\./ }),
    ).toBeTruthy()

    fireEvent.click(removeButton('15.07.2026.'))

    // Back on the branch default (the newest already-held session).
    expect(
      screen.getByRole('heading', { level: 3, name: /08\.07\.2026\./ }),
    ).toBeTruthy()
  })

  it('standard branch: removes a date bucketed into Ostali termini', () => {
    render(<AttendanceMarker {...standardProps()} />)
    addDate('26.01.2026')
    expect(screen.getAllByText('26.01.2026.').length).toBeGreaterThan(0)

    fireEvent.click(removeButton('26.01.2026.'))

    expect(screen.queryByText('26.01.2026.')).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('standard branch: removes a date that landed inside a module section', () => {
    render(<AttendanceMarker {...standardProps()} />)
    // Between the section's first and last session, so it buckets into module 1.
    addDate('14.01.2026')
    expect(screen.getAllByText('14.01.2026.').length).toBeGreaterThan(0)

    fireEvent.click(removeButton('14.01.2026.'))

    expect(screen.queryByText('14.01.2026.')).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })
})
