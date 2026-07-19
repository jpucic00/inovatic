import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CourseModuleAccordion } from '@/components/public/course-module-accordion'

// next/image renders a plain <img> in jsdom; drop the layout-only props so React
// doesn't warn about unknown boolean attributes (fill/sizes) on a native element.
vi.mock('next/image', () => ({
  default: ({ alt, src }: Readonly<{ alt: string; src: string; children?: ReactNode }>) => (
    <img alt={alt} src={src} />
  ),
}))

const modules = [
  { title: 'Modul A', description: 'Uvod A.\n\nDetalj tijela A.', image: '/a.jpg' },
  { title: 'Modul B', description: 'Uvod B.\n\nDetalj tijela B.', image: '/b.jpg' },
  { title: 'Modul C', description: 'Uvod C.\n\nDetalj tijela C.', image: '/c.jpg' },
]

const expandedStates = () =>
  screen.getAllByRole('button').map((b) => b.getAttribute('aria-expanded'))

describe('CourseModuleAccordion', () => {
  it('renders every module collapsed by default with no bodies mounted', () => {
    render(<CourseModuleAccordion modules={modules} gradient="from-cyan-400 to-cyan-600" />)

    expect(expandedStates()).toEqual(['false', 'false', 'false'])
    // Body paragraphs stay unmounted until a module is opened.
    expect(screen.queryByText('Detalj tijela A.')).toBeNull()
    expect(screen.queryByText('Detalj tijela B.')).toBeNull()
    expect(screen.queryByText('Detalj tijela C.')).toBeNull()
  })

  it('opens a module on header click, mounting only its body', () => {
    render(<CourseModuleAccordion modules={modules} gradient="from-cyan-400 to-cyan-600" />)

    fireEvent.click(screen.getAllByRole('button')[1])

    expect(expandedStates()).toEqual(['false', 'true', 'false'])
    expect(screen.queryByText('Detalj tijela B.')).not.toBeNull()
    expect(screen.queryByText('Detalj tijela A.')).toBeNull()
  })

  it('allows multiple modules open at once and toggles each independently', () => {
    render(<CourseModuleAccordion modules={modules} gradient="from-cyan-400 to-cyan-600" />)

    fireEvent.click(screen.getAllByRole('button')[0])
    fireEvent.click(screen.getAllByRole('button')[2])
    expect(expandedStates()).toEqual(['true', 'false', 'true'])

    fireEvent.click(screen.getAllByRole('button')[0])
    expect(expandedStates()).toEqual(['false', 'false', 'true'])
    expect(screen.queryByText('Detalj tijela A.')).toBeNull()
    expect(screen.queryByText('Detalj tijela C.')).not.toBeNull()
  })
})
