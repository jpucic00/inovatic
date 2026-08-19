/**
 * "Ugovor potpisan" is one click, both ways, and the only trace either way is a
 * toast that fades. These cases pin the guard in front of it: the click asks
 * first, the write happens only on confirm, and backing out writes nothing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AdminActionResult } from '@/lib/action-types'
import { EnrollmentContractToggle } from '@/components/shared/enrollment-contract-toggle'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const setSigned = vi.fn<(id: string, signed: boolean) => Promise<AdminActionResult>>(
  async () => ({ success: true }),
)

function renderToggle(
  overrides: Partial<React.ComponentProps<typeof EnrollmentContractToggle>> = {},
) {
  return render(
    <EnrollmentContractToggle
      enrollmentId="e1"
      contractSignedAt={null}
      groupLabel="SLR 2 — utorkom 18:30"
      onSetContractSigned={setSigned}
      {...overrides}
    />,
  )
}

const SIGNED = new Date(Date.UTC(2026, 7, 12))

beforeEach(() => {
  setSigned.mockClear()
})

describe('EnrollmentContractToggle — nothing is written on the first click', () => {
  it('asks before marking the contract signed', () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: 'Označi ugovor potpisanim' }))

    expect(
      screen.getByRole('heading', { name: 'Označiti ugovor potpisanim?' }),
    ).toBeInTheDocument()
    expect(setSigned).not.toHaveBeenCalled()
  })

  it('writes only once the question is answered', async () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: 'Označi ugovor potpisanim' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi potpisanim' }))

    await waitFor(() => expect(setSigned).toHaveBeenCalledWith('e1', true))
  })

  it('writes nothing when the question is dismissed', async () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: 'Označi ugovor potpisanim' }))
    fireEvent.click(screen.getByRole('button', { name: 'Odustani' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Označiti ugovor potpisanim?' }),
      ).toBeNull(),
    )
    expect(setSigned).not.toHaveBeenCalled()
  })

  // The undo is the half worth guarding most: it throws away a date nobody can
  // reconstruct, and "Poništi" sits one line above the paid chips.
  it('guards the undo too, and says it is the undo', () => {
    renderToggle({ contractSignedAt: SIGNED })
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))

    expect(
      screen.getByRole('heading', { name: 'Ukloniti oznaku ugovora?' }),
    ).toBeInTheDocument()
    expect(setSigned).not.toHaveBeenCalled()
  })

  it('clears the mark once the undo is confirmed', async () => {
    renderToggle({ contractSignedAt: SIGNED })
    fireEvent.click(screen.getByRole('button', { name: 'Poništi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ukloni oznaku' }))

    await waitFor(() => expect(setSigned).toHaveBeenCalledWith('e1', false))
  })

  // A child can hold several enrollments in one year and the modal covers the
  // card that was clicked, so the question has to name it.
  it('names the enrollment the mark belongs to', () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: 'Označi ugovor potpisanim' }))

    expect(screen.getByText('SLR 2 — utorkom 18:30')).toBeInTheDocument()
  })

  it('offers nothing to confirm in the read-only variant', () => {
    renderToggle({ contractSignedAt: SIGNED, readOnly: true })

    expect(screen.queryByRole('button')).toBeNull()
  })
})
