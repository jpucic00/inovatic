/**
 * "Samo za moj grad" (Flux qsb7uru): the curriculum is the same in Split and
 * Šibenik, so limiting a material to one city is a deliberate, explained step,
 * and the other city sees the row greyed with the reason but cannot touch it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import { StaffMaterialList } from '@/components/material/staff-material-list'
import { LessonMaterialSection } from '@/components/material/lesson-material-section'
import { CityOnlyDialog, isCityOnlyReasonValid } from '@/components/material/city-only-dialog'
import { cityOnlySummaryText } from '@/components/admin/lessons/city-only-summary'

const setMaterialCityOnly = vi.fn()
const makeMaterialShared = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/material/crud', () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
  setMaterialHidden: vi.fn(),
}))
vi.mock('@/actions/material/move', () => ({
  setMaterialsAudience: vi.fn(),
  moveMaterialToLesson: vi.fn(),
}))
vi.mock('@/actions/admin/material-city', () => ({
  setMaterialCityOnly: (...args: unknown[]) => setMaterialCityOnly(...args),
  makeMaterialShared: (...args: unknown[]) => makeMaterialShared(...args),
}))

let seq = 0
function row(title: string, overrides: Partial<StaffMaterialRow> = {}): StaffMaterialRow {
  seq += 1
  return {
    id: `m${seq}`,
    title,
    description: null,
    type: 'LINK',
    scope: 'LESSON',
    audience: 'TEACHER',
    fileUrl: null,
    externalUrl: 'https://example.com',
    fileSize: null,
    mimeType: null,
    sortOrder: 0,
    city: null,
    cityOnlyReason: null,
    otherCityOnly: false,
    ...overrides,
  }
}

const splitAdmin = { viewerCity: 'SPLIT' as const }

function section(rows: StaffMaterialRow[], cityControls: { viewerCity: 'SPLIT' } | null = splitAdmin) {
  return render(
    <LessonMaterialSection
      audience="TEACHER"
      heading="Materijali za nastavnike"
      rows={rows}
      add={null}
      canMoveAudience
      moveLessonOptions={[{ id: 'l2', label: '2. Ringišpil' }]}
      cityControls={cityControls}
    />,
  )
}

beforeEach(() => {
  setMaterialCityOnly.mockReset()
  makeMaterialShared.mockReset()
})

describe('CityOnlyDialog', () => {
  it('names the city that loses the material and blocks confirm until a reason is given', () => {
    render(
      <CityOnlyDialog open onOpenChange={vi.fn()} materialId="m1" title="Vrtuljak upute" viewerCity="SPLIT" />,
    )

    expect(screen.getByRole('heading', { name: 'Samo za Split?' })).toBeInTheDocument()
    expect(screen.getByText(/Šibenik neće dobiti ovaj materijal/)).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: 'Ograniči na Split' })
    const reason = screen.getByLabelText(/Zašto ne vrijedi za Šibenik\?/)
    expect(confirm).toBeDisabled()

    // Whitespace does not count — the server trims before its min(5).
    fireEvent.change(reason, { target: { value: '  ab   ' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(reason, { target: { value: 'Šibenik nema tu dvoranu' } })
    expect(confirm).toBeEnabled()
  })

  it('sends the trimmed reason', async () => {
    setMaterialCityOnly.mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()
    render(
      <CityOnlyDialog open onOpenChange={onOpenChange} materialId="m7" title="Upute" viewerCity="SIBENIK" />,
    )

    fireEvent.change(screen.getByLabelText(/Zašto ne vrijedi za Split\?/), {
      target: { value: '  Samo za Trokut  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ograniči na Šibenik' }))

    await waitFor(() =>
      expect(setMaterialCityOnly).toHaveBeenCalledWith({ materialId: 'm7', reason: 'Samo za Trokut' }),
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('mirrors the server bounds', () => {
    expect(isCityOnlyReasonValid('abcd')).toBe(false)
    expect(isCityOnlyReasonValid(' abcde ')).toBe(true)
    expect(isCityOnlyReasonValid('x'.repeat(501))).toBe(false)
  })
})

describe('LessonMaterialSection — city', () => {
  it("greys the other city's row, shows its badge and reason, and offers no control at all", () => {
    section([
      row('Šibenski radni list', {
        city: 'SIBENIK',
        cityOnlyReason: 'Trokut ima drugačije setove',
        otherCityOnly: true,
        canEdit: false,
      }),
    ])

    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('data-foreign-city', 'true')
    expect(within(item).getByText('Samo Šibenik')).toBeInTheDocument()
    expect(within(item).getByText('Razlog: Trokut ima drugačije setove')).toBeInTheDocument()
    expect(within(item).queryByRole('checkbox')).toBeNull()
    expect(within(item).queryByRole('button')).toBeNull()
    expect(within(item).queryByRole('combobox')).toBeNull()
  })

  it('offers "Samo za Split…" on a shared row and opens the dialog', () => {
    section([row('Vrtuljak upute')])

    fireEvent.click(screen.getByRole('button', { name: 'Samo za Split…' }))
    expect(screen.getByRole('heading', { name: 'Samo za Split?' })).toBeInTheDocument()
  })

  it('returns an own-city row to both cities without asking', async () => {
    makeMaterialShared.mockResolvedValue({ success: true })
    section([row('Splitski list', { city: 'SPLIT', cityOnlyReason: 'Samo dvorana Velebitska' })])

    expect(screen.getByText('Samo Split')).toBeInTheDocument()
    expect(screen.getByText('Razlog: Samo dvorana Velebitska')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vrati u oba grada' }))

    await waitFor(() => expect(makeMaterialShared).toHaveBeenCalledWith({ materialId: expect.any(String) }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never offers the city switch on a group row', () => {
    section([row('Naš dodatak', { scope: 'GROUP', groupName: 'PON 18:30' })])
    expect(screen.queryByRole('button', { name: /Samo za/ })).toBeNull()
  })

  it('shows the badge but no switch on a group page (no city controls)', () => {
    section([row('Splitski list', { city: 'SPLIT', cityOnlyReason: 'Samo dvorana' })], null)
    expect(screen.getByText('Samo Split')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vrati u oba grada' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Samo za/ })).toBeNull()
  })
})

describe('StaffMaterialList — city', () => {
  it("keeps the other city's whole-module row read-only", () => {
    render(
      <StaffMaterialList
        rows={[
          row('Šibenik priprema', {
            scope: 'MODULE',
            city: 'SIBENIK',
            cityOnlyReason: 'Drugačiji raspored',
            otherCityOnly: true,
            canEdit: false,
          }),
        ]}
        cityControls={splitAdmin}
      />,
    )
    expect(screen.getByText('Samo Šibenik')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers the switch and edit on a shared whole-program row', () => {
    render(<StaffMaterialList rows={[row('Priprema', { scope: 'COURSE' })]} cityControls={splitAdmin} />)
    expect(screen.getByRole('button', { name: 'Samo za Split…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uredi materijal' })).toBeInTheDocument()
  })
})

describe('cityOnlySummaryText', () => {
  it('puts the own city first and declines the noun', () => {
    expect(
      cityOnlySummaryText(
        [
          { city: 'SIBENIK', count: 1 },
          { city: 'SPLIT', count: 2 },
        ],
        'SPLIT',
      ),
    ).toBe('2 materijala vrijede samo za Split · 1 samo za Šibenik')
    expect(cityOnlySummaryText([{ city: 'SPLIT', count: 1 }], 'SIBENIK')).toBe(
      '1 materijal vrijedi samo za Split',
    )
    expect(cityOnlySummaryText([{ city: 'SPLIT', count: 5 }], 'SPLIT')).toBe(
      '5 materijala vrijedi samo za Split',
    )
  })

  it('is null when nothing is limited', () => {
    expect(cityOnlySummaryText([], 'SPLIT')).toBeNull()
  })
})
