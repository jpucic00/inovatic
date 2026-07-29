import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'

type Props = React.ComponentProps<typeof WeeklySchedule>
type Group = Props['groups'][number]

function group(overrides: Partial<Group> & Pick<Group, 'id' | 'name'>): Group {
  return {
    dayOfWeek: 'Ponedjeljak',
    startTime: '17:00',
    endTime: '18:30',
    maxStudents: 12,
    course: { title: 'Svijet LEGO robotike 1', level: 'SLR_1', kind: 'STANDARD' as const },
    location: { name: 'Velebitska 32' },
    _count: { enrollments: 5, preferredInquiries: 0 },
    ...overrides,
  }
}

const uvod = group({
  id: 'uvod',
  name: 'Uvod pon',
  course: { title: 'Uvod u Svijet LEGO robotike', level: 'UVOD', kind: 'STANDARD' },
})
const slr1 = group({ id: 'slr1', name: 'SLR1 pon' })
const slr3 = group({
  id: 'slr3',
  name: 'SLR3 uto',
  dayOfWeek: 'Utorak',
  course: { title: 'Svijet LEGO robotike 3', level: 'SLR_3', kind: 'STANDARD' },
})
// The competitive program carries no CourseLevel — it is identified by kind alone.
const competition = group({
  id: 'comp',
  name: 'WRO – subotom',
  dayOfWeek: 'Subota',
  startTime: '09:00',
  endTime: '10:30',
  course: { title: 'Natjecateljski program', level: null, kind: 'COMPETITION' },
})

// Block tooltips read "<name> – <venue>\n<day> <time>\n…", and a competition
// group's own name may contain a dash, so drop only the trailing venue segment.
const blockNames = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[title]')].map((el) =>
    el.title.split('\n')[0].split(' – ').slice(0, -1).join(' – '),
  )

describe('WeeklySchedule program filter', () => {
  it('offers a natjecateljski chip that narrows the grid to competition groups', () => {
    const { container } = render(<WeeklySchedule groups={[uvod, slr1, slr3, competition]} />)

    expect(blockNames(container)).toEqual(
      expect.arrayContaining(['Uvod pon', 'SLR1 pon', 'SLR3 uto', 'WRO – subotom']),
    )

    fireEvent.click(screen.getByRole('button', { name: /Natjecateljski/ }))

    expect(blockNames(container)).toEqual(['WRO – subotom'])
  })

  it('"Svi SLR" keeps every standard level, including Uvod, and drops the competition group', () => {
    const { container } = render(<WeeklySchedule groups={[uvod, slr1, slr3, competition]} />)

    fireEvent.click(screen.getByRole('button', { name: /Svi SLR/ }))

    const names = blockNames(container)
    expect(names).toContain('Uvod pon')
    expect(names).toContain('SLR1 pon')
    expect(names).toContain('SLR3 uto')
    expect(names).not.toContain('WRO – subotom')
  })

  it('still narrows to a single level', () => {
    const { container } = render(<WeeklySchedule groups={[uvod, slr1, slr3, competition]} />)

    fireEvent.click(screen.getByRole('button', { name: /^Uvod/ }))

    expect(blockNames(container)).toEqual(['Uvod pon'])
  })

  it('reads as a pressable control, not a legend', () => {
    render(<WeeklySchedule groups={[uvod, slr1, competition]} />)

    const chip = screen.getByRole('button', { name: /Natjecateljski/ })
    expect(chip.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    // Getting back to everything must not require guessing which chip is "off"
    fireEvent.click(screen.getByRole('button', { name: /Poništi filter/ }))
    expect(chip.getAttribute('aria-pressed')).toBe('false')
  })

  it('labels each chip with how many groups it would show', () => {
    render(<WeeklySchedule groups={[uvod, slr1, slr3, competition]} />)

    expect(screen.getByRole('button', { name: /Sve grupe/ }).textContent).toContain('4')
    expect(screen.getByRole('button', { name: /Svi SLR/ }).textContent).toContain('3')
    expect(screen.getByRole('button', { name: /Natjecateljski/ }).textContent).toContain('1')
  })

  it('hides the kind split when only one kind is scheduled', () => {
    render(<WeeklySchedule groups={[uvod, slr1]} />)

    // "Svi SLR" would just be a second "Sve grupe" here
    expect(screen.queryByRole('button', { name: /Svi SLR/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Natjecateljski/ })).toBeNull()
  })

  it('drops level chips no group would match', () => {
    render(<WeeklySchedule groups={[slr1]} />)

    expect(screen.getByRole('button', { name: /SLR 1/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /SLR 2/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Uvod/ })).toBeNull()
  })
})
