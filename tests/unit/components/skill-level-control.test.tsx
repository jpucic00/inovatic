import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillLevelControl } from '@/components/shared/skill-level-control'

describe('SkillLevelControl', () => {
  it('announces the skill name as a group and renders the three levels', () => {
    render(<SkillLevelControl label="Slaganje" value={null} onChange={() => {}} />)

    // fieldset + sr-only legend expose the skill as a named group.
    expect(screen.getByRole('group', { name: 'Slaganje' })).toBeTruthy()
    for (const label of ['Početno', 'U razvoju', 'Ostvareno']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('reports the clicked level and clears when the active segment is clicked again', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <SkillLevelControl label="Slaganje" value={null} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ostvareno' }))
    expect(onChange).toHaveBeenCalledWith('OSTVARENO')

    rerender(<SkillLevelControl label="Slaganje" value="OSTVARENO" onChange={onChange} />)
    expect(
      screen.getByRole('button', { name: 'Ostvareno' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Početno' }).getAttribute('aria-pressed'),
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Ostvareno' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('ignores clicks while disabled', () => {
    const onChange = vi.fn()
    render(
      <SkillLevelControl label="Slaganje" value={null} onChange={onChange} disabled />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Početno' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
