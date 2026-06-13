import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/shared/copy-button'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// jsdom has no navigator.clipboard — install a stub the component can call.
const writeText = vi.fn<(text: string) => Promise<void>>()
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText },
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  writeText.mockResolvedValue(undefined)
})

// Contract: click → clipboard receives the exact value, the user gets toast
// feedback (success or failure), and the accessible name is derived from the
// optional label. The component has no internal copied-state — feedback is
// toast-only, so that's what we pin.
describe('CopyButton', () => {
  it('click copies the provided value to the clipboard', async () => {
    render(<CopyButton value="mama@example.com" label="e-mail" />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiraj e-mail' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('mama@example.com'))
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('shows the success toast after the clipboard write resolves', async () => {
    render(<CopyButton value="+385912345678" label="telefon" />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiraj telefon' }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Kopirano u međuspremnik.'),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the error toast when the clipboard write rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CopyButton value="tajna" />)

    fireEvent.click(screen.getByRole('button', { name: 'Kopiraj' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Kopiranje nije uspjelo.'),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('falls back to the bare "Kopiraj" aria-label/title when no label is given', () => {
    render(<CopyButton value="x" />)

    const button = screen.getByRole('button', { name: 'Kopiraj' })
    expect(button).toHaveAttribute('title', 'Kopiraj')
  })
})
