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

function guide(n: number): StaffGuide {
  return {
    id: `g${n}`,
    title: `Vodič ${n}`,
    description: null,
    externalUrl: `https://elearning.robocamp.eu/course/${n}`,
    moduleTitle: null,
  }
}

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

describe('GuidePresenter — guide switcher', () => {
  it('renders no switcher for a single guide', () => {
    render(<GuidePresenter guides={[guide(1)]} groupLabel="SLR 2" backHref={BACK} />)

    expect(screen.queryByRole('button', { name: /Sljedeći vodič/ })).toBeNull()
  })

  it('cycles through the guides and wraps around', () => {
    render(
      <GuidePresenter guides={[guide(1), guide(2)]} groupLabel="FLL" backHref={BACK} />,
    )
    expect(screen.getAllByText('Vodič 1').length).toBeGreaterThan(0)

    const next = screen.getByRole('button', { name: /Sljedeći vodič/ })
    fireEvent.click(next)
    expect(screen.getAllByText('Vodič 2').length).toBeGreaterThan(0)

    fireEvent.click(next)
    expect(screen.getAllByText('Vodič 1').length).toBeGreaterThan(0)
  })
})
