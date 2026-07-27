import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeeklySchedule } from '@/components/admin/groups/weekly-schedule'

type Props = React.ComponentProps<typeof WeeklySchedule>
type Group = Props['groups'][number]

function group(overrides: Partial<Group> & Pick<Group, 'id' | 'startTime' | 'endTime'>): Group {
  return {
    name: 'Grupa',
    dayOfWeek: 'Ponedjeljak',
    maxStudents: 12,
    course: { title: 'Svijet LEGO robotike 1', level: 'SLR_1', isCustom: false },
    location: { name: 'Velebitska 32' },
    _count: { enrollments: 5, preferredInquiries: 0 },
    ...overrides,
  }
}

describe('WeeklySchedule empty-hour collapsing', () => {
  it('collapses the dead stretch between morning and afternoon groups', () => {
    render(
      <WeeklySchedule
        groups={[
          group({ id: 'a', name: 'Jutarnja', startTime: '09:00', endTime: '10:30' }),
          group({ id: 'b', name: 'Popodnevna', startTime: '17:00', endTime: '18:30' }),
        ]}
      />,
    )

    // The skipped range is announced once instead of scrolled through
    expect(screen.getByText('11:00–17:00')).toBeTruthy()

    // Hours around the groups stay on the axis, the collapsed ones drop off
    expect(screen.getByText('09:00')).toBeTruthy()
    expect(screen.getByText('11:00')).toBeTruthy()
    expect(screen.getByText('17:00')).toBeTruthy()
    expect(screen.queryByText('13:00')).toBeNull()
    expect(screen.queryByText('16:00')).toBeNull()
  })

  it('lifts the afternoon block up to just below the collapsed band', () => {
    const { container } = render(
      <WeeklySchedule
        groups={[
          group({ id: 'a', name: 'Jutarnja', startTime: '09:00', endTime: '10:30' }),
          group({ id: 'b', name: 'Popodnevna', startTime: '17:00', endTime: '18:30' }),
        ]}
      />,
    )

    const afternoon = container.querySelector<HTMLElement>('[title^="Popodnevna"]')!
    // Linear scale would put 17:00 at (17:00-09:00) * 0.9 + 10 = 442px
    expect(Number.parseFloat(afternoon.style.top)).toBeCloseTo(148)
    // 90 minutes still reads as 90 minutes inside a band
    expect(Number.parseFloat(afternoon.style.height)).toBeCloseTo(90 * 0.9 - 2)
  })

  // Regression: `endTime <= startTime` passes the HH:MM regex the group schemas
  // use, and it used to collapse minTime/maxTime onto the same hour, leaving zero
  // bands — the grid then crashed on `bands[bands.length - 1].top`.
  it('renders a degenerate group instead of crashing when end <= start', () => {
    expect(() =>
      render(<WeeklySchedule groups={[group({ id: 'a', startTime: '18:00', endTime: '18:00' })]} />),
    ).not.toThrow()
    expect(screen.getByText('18:00')).toBeTruthy()
  })

  it('survives a group whose end time precedes its start time', () => {
    expect(() =>
      render(<WeeklySchedule groups={[group({ id: 'a', startTime: '18:30', endTime: '08:00' })]} />),
    ).not.toThrow()
  })

  it('leaves a single empty hour to scale', () => {
    render(
      <WeeklySchedule
        groups={[
          group({ id: 'a', startTime: '17:00', endTime: '18:30' }),
          group({ id: 'b', dayOfWeek: 'Utorak', startTime: '19:00', endTime: '20:00' }),
        ]}
      />,
    )

    expect(screen.getByText('18:00')).toBeTruthy()
    expect(screen.queryByText('⋯')).toBeNull()
  })
})
