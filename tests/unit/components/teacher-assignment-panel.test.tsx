import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TeacherAssignmentPanel } from '@/components/admin/teachers/teacher-assignment-panel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/admin/teacher', () => ({
  assignTeacherToGroup: vi.fn(async () => ({ success: true })),
  unassignTeacherFromGroup: vi.fn(async () => ({ success: true })),
}))

const assignable = (id: string, schoolYear: string, name: string) => ({
  id,
  name,
  dayOfWeek: 'Ponedjeljak',
  startTime: '17:00',
  endTime: '18:30',
  schoolYear,
  course: { title: 'SLR 1' },
  location: { name: 'Velebitska 32' },
})

const assignment = (id: string, schoolYear: string, groupName: string) => ({
  id,
  scheduledGroup: {
    id: `g-${id}`,
    name: groupName,
    dayOfWeek: 'Ponedjeljak',
    startTime: '17:00',
    endTime: '18:30',
    schoolYear,
    course: { id: 'c1', title: 'SLR 1', slug: 'slr-1' },
    location: { name: 'Velebitska 32' },
  },
})

describe('TeacherAssignmentPanel — school-year tabs', () => {
  it('opens on the admin’s selected year, not on whichever year has assignments', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('a', '2025/2026', 'Grupa A'), assignment('b', '2026/2027', 'Grupa B')]}
        assignableGroups={[]}
        defaultYear="2026/2027"
      />,
    )

    expect(screen.getByText(/Grupa B/)).toBeTruthy()
    expect(screen.queryByText(/Grupa A/)).toBeNull()
  })

  it('splits assignments per year instead of listing them together', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('a', '2025/2026', 'Grupa A'), assignment('b', '2026/2027', 'Grupa B')]}
        assignableGroups={[]}
        defaultYear="2025/2026"
      />,
    )

    expect(screen.getByText(/Grupa A/)).toBeTruthy()
    expect(screen.queryByText(/Grupa B/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '2026/2027' }))
    expect(screen.getByText(/Grupa B/)).toBeTruthy()
    expect(screen.queryByText(/Grupa A/)).toBeNull()
  })

  it('offers the selected year as a tab and says so when it holds nothing', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('b', '2026/2027', 'Grupa B')]}
        assignableGroups={[]}
        defaultYear="2025/2026"
      />,
    )

    expect(screen.getByRole('button', { name: '2025/2026' })).toBeTruthy()
    expect(screen.getByText('Nema dodijeljenih grupa u 2025/2026.')).toBeTruthy()
  })

  it('keeps the original empty state — and no tabs — when nothing is assigned', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[]}
        assignableGroups={[]}
        defaultYear="2025/2026"
      />,
    )

    expect(screen.getByText('Još nema dodijeljenih grupa.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '2025/2026' })).toBeNull()
  })
})

describe('TeacherAssignmentPanel — assign dialog', () => {
  const groups = [
    assignable('g1', '2025/2026', 'Ova godina'),
    assignable('g2', '2026/2027', 'Iduća godina'),
  ]

  const openDialog = () =>
    fireEvent.click(screen.getByRole('button', { name: /Dodijeli grupu/ }))

  it('offers only the selected year’s groups, and re-filters on year change', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('a', '2025/2026', 'Grupa A')]}
        assignableGroups={groups}
        defaultYear="2025/2026"
      />,
    )
    openDialog()

    const groupSelect = screen.getByLabelText('Grupa')
    expect([...groupSelect.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '– Odaberite grupu –',
      'SLR 1 · Ova godina · Ponedjeljak, 17:00–18:30 · Velebitska 32',
    ])

    fireEvent.change(screen.getByLabelText('Školska godina'), {
      target: { value: '2026/2027' },
    })
    expect([...groupSelect.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '– Odaberite grupu –',
      'SLR 1 · Iduća godina · Ponedjeljak, 17:00–18:30 · Velebitska 32',
    ])
  })

  it('opens on the year being viewed, not on the admin’s default year', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('b', '2026/2027', 'Grupa B')]}
        assignableGroups={groups}
        defaultYear="2025/2026"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '2026/2027' }))
    openDialog()

    expect((screen.getByLabelText('Školska godina') as HTMLSelectElement).value).toBe(
      '2026/2027',
    )
  })

  it('falls back to the newest year with a free group rather than an empty list', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('a', '2025/2026', 'Grupa A')]}
        assignableGroups={[assignable('g2', '2026/2027', 'Iduća godina')]}
        defaultYear="2025/2026"
      />,
    )
    openDialog()

    expect((screen.getByLabelText('Školska godina') as HTMLSelectElement).value).toBe(
      '2026/2027',
    )
  })

  it('still lists a year whose groups are all taken, and says why it is empty', () => {
    // 2026/2027's only group is already this teacher's, so nothing is free
    // there. Dropping the year would look like a bug; it explains itself.
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('b', '2026/2027', 'Grupa B')]}
        assignableGroups={[assignable('g1', '2025/2026', 'Ova godina')]}
        defaultYear="2025/2026"
      />,
    )
    openDialog()

    const yearSelect = screen.getByLabelText('Školska godina')
    expect([...yearSelect.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '2026/2027',
      '2025/2026',
    ])

    fireEvent.change(yearSelect, { target: { value: '2026/2027' } })
    expect(
      screen.getByText('Sve grupe u 2026/2027 već su dodijeljene ovom nastavniku.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dodijeli' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('clears a picked group when the year changes, so a stale id cannot submit', () => {
    render(
      <TeacherAssignmentPanel
        teacherId="t1"
        assignments={[assignment('a', '2025/2026', 'Grupa A')]}
        assignableGroups={groups}
        defaultYear="2025/2026"
      />,
    )
    openDialog()

    fireEvent.change(screen.getByLabelText('Grupa'), { target: { value: 'g1' } })
    expect(screen.getByRole('button', { name: 'Dodijeli' }).hasAttribute('disabled')).toBe(
      false,
    )

    fireEvent.change(screen.getByLabelText('Školska godina'), {
      target: { value: '2026/2027' },
    })
    expect((screen.getByLabelText('Grupa') as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Dodijeli' }).hasAttribute('disabled')).toBe(
      true,
    )
  })
})
