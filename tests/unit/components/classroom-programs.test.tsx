import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClassroomPrograms } from '@/components/portal/classroom-programs'

function program(id: string, title: string, groupCount: number) {
  return { course: { id, title, kind: 'STANDARD' as const }, groupCount }
}

// The tile count is the first thing a teacher reads on a classroom PC, and
// Croatian declines it by the last digit: 1 grupa, 2–4 grupe, 5+ grupa.
describe('ClassroomPrograms', () => {
  it('declines the group count in Croatian', () => {
    render(
      <ClassroomPrograms
        programs={[
          program('a', 'SLR 1', 1),
          program('b', 'SLR 2', 2),
          program('c', 'SLR 3', 5),
          program('d', 'SLR 4', 11),
        ]}
      />,
    )
    expect(screen.getByText('1 grupa')).toBeDefined()
    expect(screen.getByText('2 grupe')).toBeDefined()
    expect(screen.getByText('5 grupa')).toBeDefined()
    expect(screen.getByText('11 grupa')).toBeDefined()
  })

  it('links each tile to the program step and names the empty state', () => {
    const { unmount } = render(<ClassroomPrograms programs={[program('abc', 'Uvod', 3)]} />)
    expect(screen.getByRole('link', { name: /Uvod/ }).getAttribute('href')).toBe('/portal/program/abc')
    unmount()

    render(<ClassroomPrograms programs={[]} />)
    expect(screen.getByText(/Trenutno nema aktivnih grupa/)).toBeDefined()
  })
})
