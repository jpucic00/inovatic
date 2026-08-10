import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnrollmentPaymentPanel } from '@/components/admin/students/enrollment-payment-panel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The action module reaches next-auth through the admin guard — mock the
// boundary, not the component's own logic.
vi.mock('@/actions/admin/payment', () => ({
  setModulePaid: vi.fn(async () => ({ success: true })),
  setEnrollmentYearPaid: vi.fn(async () => ({ success: true })),
  setEnrollmentMonthPaid: vi.fn(async () => ({ success: true })),
}))

// November 2026, as the SERVER would compute it — the whole point of the prop
// is that the panel never reads a clock of its own, so no test here may either.
const NOVEMBER = Date.UTC(2026, 10, 1)

const month = (year: number, monthIndex: number, paidAt: Date | null = null) => ({
  enrollmentMonthId: `m-${year}-${monthIndex}`,
  periodStart: new Date(Date.UTC(year, monthIndex, 1)),
  paidAt,
})

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof EnrollmentPaymentPanel>> = {},
) {
  return render(
    <EnrollmentPaymentPanel
      enrollmentId="e1"
      currentMonthStartMs={NOVEMBER}
      kind="COMPETITION"
      fullYearPaidAt={null}
      modules={[]}
      months={[month(2026, 9), month(2026, 10), month(2026, 11)]}
      {...overrides}
    />,
  )
}

describe('EnrollmentPaymentPanel — the owed/future month boundary', () => {
  it('treats a past month as owed', () => {
    renderPanel()
    // October is behind the boundary: it is money the family already owes.
    expect(screen.getByRole('button', { name: 'Listopad 2026.' }).getAttribute('title')).toBe(
      'Označi kao plaćeno',
    )
  })

  it('treats the current month as owed — the boundary is inclusive', () => {
    // The regression this guards: `>=` instead of `>` would mute the very month
    // being settled, and a whole cohort silently stops reading as owed on the 1st.
    renderPanel()
    expect(screen.getByRole('button', { name: 'Studeni 2026.' }).getAttribute('title')).toBe(
      'Označi kao plaćeno',
    )
  })

  it('treats a strictly-future month as not yet owed', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Prosinac 2026.' }).getAttribute('title')).toBe(
      'Mjesec još nije počeo — označi kao plaćeno unaprijed',
    )
  })

  it('reads only the prop — a month is owed or not regardless of the real clock', () => {
    // Same three months, but the server says it is still September. December is
    // unchanged (future), and now October and November are future too.
    renderPanel({ currentMonthStartMs: Date.UTC(2026, 8, 1) })
    for (const label of ['Listopad 2026.', 'Studeni 2026.', 'Prosinac 2026.']) {
      expect(screen.getByRole('button', { name: label }).getAttribute('title')).toBe(
        'Mjesec još nije počeo — označi kao plaćeno unaprijed',
      )
    }
  })

  it('shows a paid month as paid even when it is still in the future', () => {
    renderPanel({ months: [month(2026, 11, new Date(Date.UTC(2026, 9, 15)))] })
    expect(screen.getByRole('button', { name: 'Prosinac 2026.' }).getAttribute('title')).toBe(
      'Označi kao neplaćeno',
    )
  })

  it('makes every month a non-interactive span once the year is marked paid', () => {
    renderPanel({ fullYearPaidAt: new Date(Date.UTC(2026, 8, 20)) })
    // No month is clickable any more — the year mark covers all of them, so an
    // owed/future distinction would be meaningless here.
    expect(screen.queryByRole('button', { name: 'Listopad 2026.' })).toBeNull()
    expect(
      screen.getAllByTitle('Pokriveno oznakom plaćene cijele godine'),
    ).toHaveLength(3)
  })

  it('says so when the season has no months yet instead of rendering nothing', () => {
    renderPanel({ months: [] })
    expect(
      screen.getByText(/Trajanje programa još nije određeno/),
    ).toBeTruthy()
  })
})
