import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { GroupsBoard } from '@/components/admin/groups/groups-board'

// The board mirrors its selection into ?tab= so Back can restore it. This suite
// is about which rows the filter picks, so the navigation is stubbed — the URL
// round-trip itself is covered in tests/unit/lib/group-filter.test.ts.
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

// The real table pulls deleteGroup + next/navigation; all this suite needs from
// it is which rows it was handed, and whether the Program column was dropped.
vi.mock('@/components/admin/groups/group-table', () => ({
  GroupTable: ({
    data,
    hideProgram,
  }: Readonly<{ data: { id: string; name: string | null }[]; hideProgram?: boolean }>) => (
    <div data-testid="group-table" data-hide-program={String(Boolean(hideProgram))}>
      {data.map((g) => g.name).join('|')}
    </div>
  ),
}))

type Group = ComponentProps<typeof GroupsBoard>['groups'][number]

function group(overrides: Partial<Group> & Pick<Group, 'id' | 'name'>): Group {
  return {
    dateStart: null,
    dateEnd: null,
    dayOfWeek: 'Ponedjeljak',
    startTime: '17:00',
    endTime: '18:30',
    schoolYear: '2025/2026',
    maxStudents: 12,
    enrollmentStart: null,
    enrollmentEnd: null,
    courseId: 'c-slr1',
    locationId: 'l-1',
    course: { id: 'c-slr1', title: 'Svijet LEGO robotike 1', level: 'SLR_1', kind: 'STANDARD' },
    location: { id: 'l-1', name: 'Velebitska 32' },
    _count: {
      enrollments: 5,
      preferredInquiries: 0,
      assignedInquiries: 0,
      materials: 0,
      studentComments: 0,
      galleryImages: 0,
    },
    ...overrides,
  }
}

const uvod = group({
  id: 'uvod',
  name: 'Uvod pon',
  courseId: 'c-uvod',
  course: { id: 'c-uvod', title: 'Uvod u Svijet LEGO robotike', level: 'UVOD', kind: 'STANDARD' },
})
const slr1 = group({ id: 'slr1', name: 'SLR1 pon' })
const competition = group({
  id: 'comp',
  name: 'WRO subotom',
  dayOfWeek: 'Subota',
  startTime: '09:00',
  endTime: '10:30',
  courseId: 'c-comp',
  course: { id: 'c-comp', title: 'Natjecateljski program', level: null, kind: 'COMPETITION' },
})
// Radionice live on a date range, so they never reach the weekly grid.
const radionica = group({
  id: 'rad',
  name: 'Ljetna radionica',
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  dateStart: '2026-08-10',
  dateEnd: '2026-08-12',
  courseId: 'c-rad',
  course: { id: 'c-rad', title: 'Robotika u 2 dana', level: null, kind: 'RADIONICA' },
})

const ALL = [uvod, slr1, competition, radionica]

const tableRows = () => screen.getByTestId('group-table').textContent?.split('|').filter(Boolean) ?? []
const gridBlocks = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[title]')].map((el) => el.title.split(' – ')[0])

function renderBoard(groups: Group[] = ALL, initialFilter: ComponentProps<typeof GroupsBoard>['initialFilter'] = 'all') {
  return render(<GroupsBoard groups={groups} editable initialFilter={initialFilter} />)
}

describe('GroupsBoard — one filter over the grid and the table', () => {
  it('lists every group in the table by default, radionice included', () => {
    renderBoard()
    expect(tableRows()).toEqual(['Uvod pon', 'SLR1 pon', 'WRO subotom', 'Ljetna radionica'])
  })

  it('narrows the table and the grid together', () => {
    const { container } = renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /Natjecateljski/ }))

    expect(tableRows()).toEqual(['WRO subotom'])
    expect(gridBlocks(container)).toEqual(['WRO subotom'])
  })

  it('"Svi SLR" keeps Uvod alongside the numbered levels', () => {
    renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /Svi SLR/ }))

    expect(tableRows()).toEqual(['Uvod pon', 'SLR1 pon'])
  })

  // The tab strip was the only way to reach radionice; the chip has to replace it.
  it('reaches radionice, and explains why the grid is empty for them', () => {
    renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /Radionice/ }))

    expect(tableRows()).toEqual(['Ljetna radionica'])
    expect(screen.getByText(/Radionice nemaju tjedni termin/)).toBeTruthy()
  })

  it('names the current selection above the table', () => {
    renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /^Uvod/ }))

    expect(screen.getByRole('heading', { name: 'Uvod' })).toBeTruthy()
    expect(screen.getByText('1 grupa')).toBeTruthy()
  })

  it('drops the Program column only when one program is selected', () => {
    renderBoard()
    const table = () => screen.getByTestId('group-table').getAttribute('data-hide-program')

    expect(table()).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: /SLR 1/ }))
    expect(table()).toBe('true')

    // Radionice are many different courses — the column still says something
    fireEvent.click(screen.getByRole('button', { name: /Radionice/ }))
    expect(table()).toBe('false')
  })

  it('opens on the program a /admin/programi link points at', () => {
    renderBoard(ALL, 'competition')

    expect(tableRows()).toEqual(['WRO subotom'])
    expect(screen.getByRole('button', { name: /Natjecateljski/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('counts every group on each chip, not only the ones with a weekly termin', () => {
    renderBoard()

    expect(screen.getByRole('button', { name: /Sve grupe/ }).textContent).toContain('4')
    // The radionica has no weekday at all yet still counts
    expect(screen.getByRole('button', { name: /Radionice/ }).textContent).toContain('1')
  })

  it('hides a kind chip that would cover everything', () => {
    renderBoard([uvod, slr1])

    expect(screen.queryByRole('button', { name: /Svi SLR/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Natjecateljski/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Radionice/ })).toBeNull()
    // …but the level chips stay, and still filter
    expect(screen.getByRole('button', { name: /SLR 1/ })).toBeTruthy()
  })

  it('clears back to everything', () => {
    renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /SLR 1/ }))
    expect(tableRows()).toEqual(['SLR1 pon'])

    fireEvent.click(screen.getByRole('button', { name: /Poništi filter/ }))
    expect(tableRows()).toHaveLength(4)
  })

  // The selection used to live in state alone, so Back from a group landed on
  // "Sve grupe" whichever program you had been looking at.
  it('mirrors the selection into ?tab= so it survives leaving the page', () => {
    replace.mockClear()
    renderBoard()

    fireEvent.click(screen.getByRole('button', { name: /SLR 1/ }))
    expect(replace).toHaveBeenLastCalledWith('/admin/grupe?tab=SLR_1', { scroll: false })

    // "Poništi filter" is this board's clear, so it has to land on the bare
    // path — that is what stops the memory putting the old tab straight back.
    fireEvent.click(screen.getByRole('button', { name: /Poništi filter/ }))
    expect(replace).toHaveBeenLastCalledWith('/admin/grupe', { scroll: false })
  })
})
