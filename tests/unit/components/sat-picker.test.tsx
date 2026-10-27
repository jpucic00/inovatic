import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SatPicker } from '@/components/admin/lessons/sat-picker'

const renderPicker = (selected: number[]) =>
  render(
    <SatPicker selected={selected} onChange={vi.fn()} slots={[1, 2, 3]} taken={[]} satDates={[]} />,
  )

describe('SatPicker', () => {
  it('warns that parents will not see a lesson with no sat picked', () => {
    renderPicker([])
    expect(screen.getByRole('status')).toHaveTextContent('Bez odabranog termina')
    expect(screen.getByRole('status')).toHaveTextContent('Roditelji ne vide ovu lekciju')
  })

  it('drops the warning once a sat is picked', () => {
    renderPicker([2])
    expect(screen.queryByRole('status')).toBeNull()
  })
})
