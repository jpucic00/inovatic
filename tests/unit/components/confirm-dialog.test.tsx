/**
 * The dialog's own safety properties, tested directly rather than through a
 * caller.
 *
 * Both callers guard money marks, and each of these behaviours is one cosmetic
 * edit away from being lost — reordering the footer buttons looks like styling
 * and silently makes Enter confirm; rendering straight off `request` looks like
 * a simplification and empties the box mid-fade. Neither shows up in a caller's
 * test, because a caller asserts that confirming writes and cancelling does not,
 * which stays true either way.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'

const onConfirm = vi.fn()
const onClose = vi.fn()

function makeRequest(overrides: Partial<ConfirmRequest> = {}): ConfirmRequest {
  return {
    title: 'Označiti modul plaćenim?',
    description: 'Modul 2 — Robotska ruka',
    context: 'SLR 2 — utorkom 18:30',
    confirmLabel: 'Označi plaćeno',
    onConfirm,
    ...overrides,
  }
}

beforeEach(() => {
  onConfirm.mockClear()
  onClose.mockClear()
})

describe('ConfirmDialog', () => {
  it('gives the dialog its initial focus to Odustani, so a stray Enter cancels', () => {
    render(<ConfirmDialog request={makeRequest()} onClose={onClose} />)

    const cancel = screen.getByRole('button', { name: 'Odustani' })
    const confirmBtn = screen.getByRole('button', { name: 'Označi plaćeno' })

    // The property is positional: Radix focuses the first focusable node, so
    // "Odustani first in the DOM" IS the guard. Asserted on document order
    // rather than on activeElement, which jsdom resolves inconsistently for a
    // portalled node.
    expect(cancel.compareDocumentPosition(confirmBtn)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('writes only on the confirm button', () => {
    render(<ConfirmDialog request={makeRequest()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Odustani' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Označi plaćeno' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // Confirming closes too — the caller does not have to.
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows the NEXT question after a close, not the one before it', () => {
    // The remembered-copy mechanism, pinned from the side that is observable.
    //
    // `shown` is state seeded from `request` and refreshed by an effect, so that
    // the copy survives the frame in which `request` goes null and Radix is
    // still fading the node out. That frame itself cannot be asserted in jsdom —
    // with no animation Radix unmounts the content the moment `open` goes false,
    // so a version rendering straight off `request` would look identical here.
    //
    // What IS observable is the other half of the same mechanism: drop the
    // effect and `shown` keeps its initial value for the life of the component,
    // so the second question would open showing the first one's copy. One
    // dialog serves many buttons, which is exactly when that bites.
    const { rerender } = render(<ConfirmDialog request={makeRequest()} onClose={onClose} />)
    expect(screen.getByText('Označiti modul plaćenim?')).toBeInTheDocument()

    rerender(<ConfirmDialog request={null} onClose={onClose} />)

    rerender(
      <ConfirmDialog
        request={makeRequest({
          title: 'Ukloniti oznaku plaćanja?',
          description: 'Modul 3 — Senzori',
          confirmLabel: 'Ukloni oznaku',
          destructive: true,
        })}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('Ukloniti oznaku plaćanja?')).toBeInTheDocument()
    expect(screen.getByText('Modul 3 — Senzori')).toBeInTheDocument()
    expect(screen.queryByText('Označiti modul plaćenim?')).not.toBeInTheDocument()
  })

  it('names the row the mark belongs to', () => {
    // A child in two groups has the same module titles in both, so the context
    // line is what makes the question answerable at all.
    render(<ConfirmDialog request={makeRequest()} onClose={onClose} />)
    expect(screen.getByText('SLR 2 — utorkom 18:30')).toBeInTheDocument()
  })

  it('paints the confirm button red only when a mark is being taken away', () => {
    const { rerender } = render(
      <ConfirmDialog request={makeRequest()} onClose={onClose} />,
    )
    const setting = screen.getByRole('button', { name: 'Označi plaćeno' })
    const settingClasses = setting.className

    rerender(
      <ConfirmDialog
        request={makeRequest({ confirmLabel: 'Ukloni oznaku', destructive: true })}
        onClose={onClose}
      />,
    )
    const undoing = screen.getByRole('button', { name: 'Ukloni oznaku' })

    // Setting a mark is ordinary bookkeeping; undoing one throws a date on the
    // floor that nobody can reconstruct, and only that direction is painted.
    // Matched on the variant's own background token: every button carries
    // `aria-invalid:*-destructive` in its base classes, so a bare /destructive/
    // is true of both and asserts nothing.
    expect(undoing.className).toMatch(/\bbg-destructive\b/)
    expect(settingClasses).not.toMatch(/\bbg-destructive\b/)
    expect(settingClasses).toMatch(/\bbg-primary\b/)
  })

  it('renders nothing to click when there is no request', () => {
    render(<ConfirmDialog request={null} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: 'Odustani' })).not.toBeInTheDocument()
  })
})
