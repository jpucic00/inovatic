/**
 * The sidebar school-year switcher (Flux ojkxwfu).
 *
 * Two of its three behaviours are safety rails rather than decoration: the
 * "Arhiva" line is the only thing telling an admin why a past year's screens
 * look read-only, and creating a school year is irreversible from the UI — so
 * the confirm dialog must be able to close without calling the action.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

const createSchoolYear = vi.fn(async () => ({ success: true }))
const setSelectedSchoolYear = vi.fn<(year: string) => Promise<{ success: true }>>(
  async () => ({ success: true }),
)

vi.mock('@/actions/admin/school-year', () => ({
  createSchoolYear: () => createSchoolYear(),
  setSelectedSchoolYear: (year: string) => setSelectedSchoolYear(year),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { SchoolYearSwitcher } = await import('@/components/admin/school-year-switcher')

const CURRENT = computeSchoolYear()
const NEXT = getNextSchoolYear(CURRENT)
const ARCHIVED = '2019/2020'

function renderSwitcher(selectedYear: string) {
  return render(
    <SchoolYearSwitcher
      years={[CURRENT, ARCHIVED]}
      selectedYear={selectedYear}
      currentYear={CURRENT}
    />,
  )
}

beforeEach(() => {
  createSchoolYear.mockClear()
  setSelectedSchoolYear.mockClear()
})

describe('SchoolYearSwitcher', () => {
  it('flags a past year as archive', () => {
    renderSwitcher(ARCHIVED)
    expect(screen.getByText('Arhiva — samo za pregled')).toBeInTheDocument()
  })

  it('says nothing about archive on the current year', () => {
    renderSwitcher(CURRENT)
    expect(screen.queryByText('Arhiva — samo za pregled')).not.toBeInTheDocument()
  })

  it('names the year that would be created, so the confirm is not a blind yes', () => {
    renderSwitcher(CURRENT)
    fireEvent.click(screen.getByRole('button', { name: 'Nova školska godina' }))

    expect(screen.getByRole('heading', { name: 'Nova školska godina' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Kreiraj ${NEXT}` })).toBeInTheDocument()
  })

  it('does not create the year when the dialog is dismissed', () => {
    renderSwitcher(CURRENT)
    fireEvent.click(screen.getByRole('button', { name: 'Nova školska godina' }))

    fireEvent.click(screen.getByRole('button', { name: 'Odustani' }))

    expect(createSchoolYear).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: `Kreiraj ${NEXT}` }),
    ).not.toBeInTheDocument()
  })

  it('creates the year on confirm', () => {
    renderSwitcher(CURRENT)
    fireEvent.click(screen.getByRole('button', { name: 'Nova školska godina' }))

    fireEvent.click(screen.getByRole('button', { name: `Kreiraj ${NEXT}` }))

    expect(createSchoolYear).toHaveBeenCalledTimes(1)
  })

  it('marks the current year with a dot in the open dropdown', () => {
    renderSwitcher(ARCHIVED)
    // Radix opens on keyboard as well as pointer, and jsdom drives keys reliably.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Odaberi školsku godinu' }), {
      key: 'Enter',
    })

    const currentOption = screen.getByRole('option', { name: CURRENT })
    expect(currentOption.querySelector('span.bg-green-400')).not.toBeNull()
    const archivedOption = screen.getByRole('option', { name: ARCHIVED })
    expect(archivedOption.querySelector('span.bg-green-400')).toBeNull()
  })
})
