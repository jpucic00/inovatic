/**
 * One dialog stands behind both "Nova lokacija" and a row's "Uredi". What is
 * easy to get wrong is the edit half: a venue's optional columns are nullable,
 * and a null reaching an input renders as the literal string — so the row has
 * to round-trip through the form untouched, and `city` must never appear in
 * the payload at all.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocationFormDialog } from '@/components/admin/locations/location-form-dialog'

const createLocation = vi.fn<(input: unknown) => Promise<{ success: true }>>(() =>
  Promise.resolve({ success: true }),
)
const updateLocation = vi.fn<(input: unknown) => Promise<{ success: true }>>(() =>
  Promise.resolve({ success: true }),
)

vi.mock('@/actions/admin/location', () => ({
  createLocation: (input: unknown) => createLocation(input),
  updateLocation: (input: unknown) => updateLocation(input),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type EditableLocation = {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
}

const VENUE: EditableLocation = {
  id: 'loc-1',
  name: 'Trokut inkubator',
  address: 'Velimira Škorpika 7/a, 22000 Šibenik',
  phone: '+385 92 168 9987',
  email: 'sibenik@udruga-inovatic.hr',
}

function openEdit(location: EditableLocation = VENUE) {
  render(<LocationFormDialog location={location} />)
  fireEvent.click(screen.getByRole('button', { name: 'Uredi' }))
}

beforeEach(() => {
  createLocation.mockClear()
  updateLocation.mockClear()
})

describe('LocationFormDialog', () => {
  it('opens a create form when no venue is passed', () => {
    render(<LocationFormDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova lokacija' }))

    expect(screen.getByRole('heading', { name: 'Nova lokacija' })).toBeInTheDocument()
    expect(screen.getByLabelText('Naziv *')).toHaveValue('')
  })

  it('prefills the form from the row it was opened on', () => {
    openEdit()

    expect(screen.getByRole('heading', { name: 'Uredi lokaciju' })).toBeInTheDocument()
    expect(screen.getByLabelText('Naziv *')).toHaveValue(VENUE.name)
    expect(screen.getByLabelText('Adresa *')).toHaveValue(VENUE.address)
    expect(screen.getByLabelText('Telefon')).toHaveValue(VENUE.phone)
    expect(screen.getByLabelText('Email')).toHaveValue(VENUE.email)
  })

  // A nullable column reaching a value-bound input renders as "null" and then
  // saves that back as the venue's phone number.
  it('renders a null phone and email as empty inputs', () => {
    openEdit({ ...VENUE, phone: null, email: null })

    expect(screen.getByLabelText('Telefon')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })

  it('submits an edit through updateLocation carrying the row id and no city', async () => {
    openEdit()
    fireEvent.change(screen.getByLabelText('Naziv *'), {
      target: { value: 'Trokut inkubator — dvorana 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))

    await waitFor(() => expect(updateLocation).toHaveBeenCalledTimes(1))
    expect(createLocation).not.toHaveBeenCalled()

    const payload = updateLocation.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ id: 'loc-1', name: 'Trokut inkubator — dvorana 2' })
    expect(payload).not.toHaveProperty('city')
  })

  it('submits a new venue through createLocation with no id', async () => {
    render(<LocationFormDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Nova lokacija' }))
    fireEvent.change(screen.getByLabelText('Naziv *'), { target: { value: 'OŠ Mertojak' } })
    fireEvent.change(screen.getByLabelText('Adresa *'), {
      target: { value: 'Kroz Smrdečac 24, 21000 Split' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Kreiraj lokaciju' }))

    await waitFor(() => expect(createLocation).toHaveBeenCalledTimes(1))
    expect(updateLocation).not.toHaveBeenCalled()

    const payload = createLocation.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ name: 'OŠ Mertojak' })
    expect(payload).not.toHaveProperty('id')
  })
})
