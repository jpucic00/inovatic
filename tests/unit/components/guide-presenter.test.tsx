import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GuidePresenter } from '@/components/teacher/guide-presenter'
import type { StaffGuide } from '@/actions/teacher/materials'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
// The real embed measures itself against layout jsdom does not do; the
// presenter's own contract is the bar and the Esc behaviour, not the scaling.
vi.mock('@/components/material/robocamp-embed', () => ({
  RobocampEmbed: ({ title }: { title?: string }) => (
    <div data-testid="embed">{title}</div>
  ),
}))

function guide(n: number, overrides: Partial<StaffGuide> = {}): StaffGuide {
  return {
    id: `g${n}`,
    title: `Vodič ${n}`,
    description: null,
    externalUrl: `https://elearning.robocamp.eu/course/${n}`,
    moduleTitle: null,
    lessonId: `l${n}`,
    lessonTitle: `Lekcija ${n}`,
    inCurrentLesson: false,
    ...overrides,
  }
}

const embedTitle = () => screen.getByTestId('embed').textContent

const BACK = '/nastavnik/grupa/g-1/materijali'

beforeEach(() => {
  push.mockClear()
})

afterEach(() => {
  // Undo any stubbed fullscreen state so tests stay order-independent.
  delete (document as { fullscreenElement?: Element | null }).fullscreenElement
})

describe('GuidePresenter — leaving', () => {
  it('Esc leaves the presentation when not in fullscreen', () => {
    render(<GuidePresenter guides={[guide(1)]} groupLabel="SLR 2" backHref={BACK} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(push).toHaveBeenCalledWith(BACK)
  })

  it('Esc deliberately does nothing while fullscreen is active', () => {
    // The browser consumes the first Esc to exit fullscreen; if this handler
    // also fired, one press would yank the teacher out of fullscreen AND the
    // lesson at once, mid-class on the projector.
    render(<GuidePresenter guides={[guide(1)]} groupLabel="SLR 2" backHref={BACK} />)
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.createElement('div'),
      configurable: true,
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(push).not.toHaveBeenCalled()
  })

  it('the Izađi button leaves too', () => {
    render(<GuidePresenter guides={[guide(1)]} groupLabel="SLR 2" backHref={BACK} />)

    fireEvent.click(screen.getByRole('button', { name: /Izađi/ }))

    expect(push).toHaveBeenCalledWith(BACK)
  })
})

describe('GuidePresenter — opening guide', () => {
  it('opens on the guide of the current lesson, not the first one', () => {
    render(
      <GuidePresenter
        guides={[guide(1), guide(2, { inCurrentLesson: true }), guide(3)]}
        groupLabel="SLR 2"
        backHref={BACK}
      />,
    )

    expect(embedTitle()).toBe('Vodič 2')
    // The bar names the lesson, so the teacher sees which one is on the wall.
    expect(screen.getByText(/SLR 2 · Lekcija 2/)).toBeTruthy()
  })

  it('falls back to the first guide when no lesson is current yet', () => {
    render(<GuidePresenter guides={[guide(1), guide(2)]} groupLabel="SLR 2" backHref={BACK} />)

    expect(embedTitle()).toBe('Vodič 1')
  })
})

describe('GuidePresenter — guide picker', () => {
  it('renders no picker for a single guide', () => {
    render(<GuidePresenter guides={[guide(1)]} groupLabel="SLR 2" backHref={BACK} />)

    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('labels every option by lesson and marks the current lesson', () => {
    render(
      <GuidePresenter
        guides={[guide(1), guide(2, { inCurrentLesson: true })]}
        groupLabel="SLR 2"
        backHref={BACK}
      />,
    )

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Lekcija 1 · Vodič 1', 'Lekcija 2 · Vodič 2 (trenutna lekcija)'])
    // A single module needs no group headings.
    expect(document.querySelector('optgroup')).toBeNull()
  })

  it('switches the embedded guide when another one is picked', () => {
    render(<GuidePresenter guides={[guide(1), guide(2)]} groupLabel="SLR 2" backHref={BACK} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Odaberi vodič' }), {
      target: { value: '1' },
    })

    expect(embedTitle()).toBe('Vodič 2')
  })

  it('groups the options per natjecanje when the guides span several modules', () => {
    render(
      <GuidePresenter
        guides={[
          guide(1, { moduleTitle: 'FLL' }),
          guide(2, { moduleTitle: 'FLL' }),
          guide(3, { moduleTitle: 'WRO' }),
        ]}
        groupLabel="Natjecateljski program"
        backHref={BACK}
      />,
    )

    const groups = [...document.querySelectorAll('optgroup')].map((g) => ({
      label: g.getAttribute('label'),
      count: g.querySelectorAll('option').length,
    }))
    expect(groups).toEqual([
      { label: 'FLL', count: 2 },
      { label: 'WRO', count: 1 },
    ])
  })
})
