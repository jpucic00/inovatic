import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TeacherGroupSummary } from '@/actions/teacher/dashboard'
import { TeacherGroupsBoard } from '@/components/teacher/teacher-groups-board'

const CURRENT = '2025/2026'

const group = (
  id: string,
  schoolYear: string,
  overrides: Partial<TeacherGroupSummary> = {},
): TeacherGroupSummary => ({
  id,
  name: `Grupa ${id}`,
  dayOfWeek: 'PON',
  startTime: '17:00',
  endTime: '18:30',
  schoolYear,
  course: { id: 'c1', title: 'SLR 1', kind: 'STANDARD' },
  location: { id: 'l1', name: 'Velebitska 32' },
  enrollmentCount: 8,
  materialCount: 0,
  ...overrides,
})

describe('TeacherGroupsBoard — school-year tabs', () => {
  it('opens on the current school year even when a past year has more groups', () => {
    render(
      <TeacherGroupsBoard
        groups={[group('a', '2024/2025'), group('b', '2024/2025'), group('c', CURRENT)]}
        currentYear={CURRENT}
      />,
    )

    expect(screen.getByText('Grupa c')).toBeTruthy()
    expect(screen.queryByText('Grupa a')).toBeNull()
  })

  it('lists every year with groups, newest first, and switches on click', () => {
    render(
      <TeacherGroupsBoard
        groups={[group('a', '2023/2024'), group('b', '2024/2025'), group('c', CURRENT)]}
        currentYear={CURRENT}
      />,
    )

    const tabs = screen.getAllByRole('button').map((b) => b.textContent)
    expect(tabs).toEqual([CURRENT, '2024/2025', '2023/2024'])

    fireEvent.click(screen.getByRole('button', { name: '2023/2024' }))
    expect(screen.getByText('Grupa a')).toBeTruthy()
    expect(screen.queryByText('Grupa c')).toBeNull()
  })

  it('offers the current year as a tab even with no groups in it', () => {
    render(<TeacherGroupsBoard groups={[group('a', '2024/2025')]} currentYear={CURRENT} />)

    expect(screen.getByRole('button', { name: CURRENT })).toBeTruthy()
    expect(screen.getByText(`Nemate dodijeljenih grupa za školsku godinu ${CURRENT}.`)).toBeTruthy()
  })

  it('still names the year when it is the only one — the list is never year-ambiguous', () => {
    render(<TeacherGroupsBoard groups={[group('a', CURRENT)]} currentYear={CURRENT} />)

    expect(screen.getByText('Školska godina:')).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([CURRENT])
    expect(screen.getByText('Grupa a')).toBeTruthy()
  })
})
