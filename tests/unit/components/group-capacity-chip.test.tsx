import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'

// Three branches × Croatian singular/plural toggle. The chip is the only
// shared piece of UI vocabulary for capacity state across the admin dialogs
// (create-account, send-schedule, add-enrollment, create-student) and the
// public inquiry form copy, so the text + Tailwind class strings are part of
// its contract.
describe('GroupCapacityChip', () => {
  it('renders Popunjeno with red classes when isFull', () => {
    const { container } = render(<GroupCapacityChip availableSpots={0} isFull={true} />)
    expect(screen.getByText('Popunjeno')).toBeDefined()
    const span = container.firstChild as HTMLElement
    expect(span.className).toContain('bg-red-50')
    expect(span.className).toContain('text-red-700')
    expect(span.className).toContain('border-red-200')
  })

  it('renders Croatian singular when availableSpots === 1 with amber classes', () => {
    const { container } = render(<GroupCapacityChip availableSpots={1} isFull={false} />)
    expect(screen.getByText('Još 1 slobodno mjesto')).toBeDefined()
    const span = container.firstChild as HTMLElement
    expect(span.className).toContain('bg-amber-50')
    expect(span.className).toContain('text-amber-700')
  })

  it('renders Croatian dual/few plural when availableSpots === 2 with amber classes', () => {
    const { container } = render(<GroupCapacityChip availableSpots={2} isFull={false} />)
    expect(screen.getByText('Još 2 slobodna mjesta')).toBeDefined()
    const span = container.firstChild as HTMLElement
    expect(span.className).toContain('bg-amber-50')
  })

  it('renders general plural with green classes when availableSpots > 2', () => {
    const { container } = render(<GroupCapacityChip availableSpots={5} isFull={false} />)
    expect(screen.getByText('5 slobodnih mjesta')).toBeDefined()
    const span = container.firstChild as HTMLElement
    expect(span.className).toContain('bg-green-50')
    expect(span.className).toContain('text-green-700')
  })

  it('still renders Popunjeno (red) even if isFull but availableSpots > 0 (defensive contract)', () => {
    // isFull is the source of truth — the chip must trust it. Capacity
    // calcs upstream may set availableSpots to a leftover value during the
    // brief window between server response and UI refresh; the chip cannot
    // contradict itself.
    render(<GroupCapacityChip availableSpots={3} isFull={true} />)
    expect(screen.getByText('Popunjeno')).toBeDefined()
  })
})
