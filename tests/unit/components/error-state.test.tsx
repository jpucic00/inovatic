/**
 * The shared error.tsx body. What matters is that "Pokušaj ponovno" actually
 * refetches: reset() alone only re-renders on the client and would replay the
 * same failed Server Component payload, so refresh() must run with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorState } from '@/components/shared/error-state'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

function renderState(error: Error & { digest?: string }, reset = vi.fn()) {
  render(<ErrorState error={error} reset={reset} backHref="/nastavnik" backLabel="Natrag na moje grupe" />)
  return reset
}

describe('ErrorState', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    refresh.mockClear()
    vi.restoreAllMocks()
  })

  it('offers a retry and a way back', () => {
    renderState(new Error('boom'))
    expect(screen.getByRole('heading', { name: 'Nešto je pošlo po zlu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pokušaj ponovno/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Natrag na moje grupe/ }).getAttribute('href')).toBe('/nastavnik')
  })

  it('refetches the page and resets the boundary on retry', () => {
    const reset = renderState(new Error('boom'))
    fireEvent.click(screen.getByRole('button', { name: /Pokušaj ponovno/ }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('shows the digest so a report can be matched to the server log', () => {
    renderState(Object.assign(new Error('boom'), { digest: '2854670793' }))
    expect(screen.getByText('Kod greške: 2854670793')).toBeTruthy()
  })

  it('omits the digest line when there is none', () => {
    renderState(new Error('boom'))
    expect(screen.queryByText(/Kod greške/)).toBeNull()
  })
})
