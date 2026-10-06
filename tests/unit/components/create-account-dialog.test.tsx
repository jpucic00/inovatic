/**
 * A group can be "full" purely of NEW-inquiry reservations — including the
 * seat reserved by the very inquiry this dialog is converting. The server
 * frees that seat before asserting capacity (createStudentFromInquiry), so
 * getGroupsForCourse excludes it from the count and flags the group; the
 * dialog must offer that group with a label saying whose seat it is, while a
 * group full for any other reason stays disabled. Regression pinned here:
 * 12 upita na grupi od 12 mjesta → nijedan račun se nije mogao kreirati jer
 * je dijalog sve prikazivao kao Popunjeno.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateAccountDialog } from '@/components/admin/inquiries/create-account-dialog'
import { createStudentFromInquiry } from '@/actions/admin/student'

vi.mock('@/actions/admin/student', () => ({ createStudentFromInquiry: vi.fn() }))
vi.mock('@/actions/admin/inquiry', () => ({ getGroupsForCourse: vi.fn(async () => []) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const RESERVED_NOTE = 'uključuje mjesto rezervirano za ovo dijete'

const baseGroup = {
  name: null,
  dayOfWeek: null,
  dateStart: '2026-10-01',
  dateEnd: '2026-10-15',
  startTime: '18:00',
  endTime: '19:30',
  location: { name: 'Velebitska 32' },
  course: { title: 'Ljetna radionica', kind: 'RADIONICA' as const },
}

function openDialog() {
  render(
    <CreateAccountDialog
      inquiryId="inq-1"
      childName="Ana Anić"
      initialGroups={[
        {
          ...baseGroup,
          id: 'g-reserved',
          availableSpots: 1,
          isFull: false,
          reservedByThisInquiry: true,
        },
        {
          ...baseGroup,
          id: 'g-full',
          availableSpots: 0,
          isFull: true,
          reservedByThisInquiry: false,
        },
      ]}
      courses={[{ id: 'c-1', title: 'Ljetna radionica' }]}
      preferredCourseId="c-1"
      preferredGroupId="g-reserved"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Kreiraj račun i upiši' }))
}

describe('CreateAccountDialog — mjesto rezervirano ovim upitom', () => {
  it('offers the reservation-freed group, preselected, with the label saying whose seat it is', () => {
    openDialog()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios[0]).not.toBeDisabled()
    // preferredGroupId preselects it, so the admin is one click from creating.
    expect(radios[0]).toBeChecked()
    // The label sits only on the flagged group — never on the genuinely full one.
    expect(screen.getAllByText(RESERVED_NOTE)).toHaveLength(1)
  })

  it('keeps a genuinely full group disabled', () => {
    openDialog()
    const radios = screen.getAllByRole('radio')
    expect(radios[1]).toBeDisabled()
    expect(screen.getByText('Popunjeno')).toBeInTheDocument()
  })

  it('enables submit for the preselected reservation-freed radionica group', () => {
    openDialog()
    // Trigger and submit share the accessible name; the submit is the last one.
    const buttons = screen.getAllByRole('button', { name: 'Kreiraj račun i upiši' })
    expect(buttons[buttons.length - 1]).not.toBeDisabled()
  })
})

describe('CreateAccountDialog — potvrda roditeljskog računa', () => {
  const createMock = vi.mocked(createStudentFromInquiry)

  beforeEach(() => {
    createMock.mockReset()
    createMock.mockResolvedValue({
      success: false,
      error: 'Potvrdite roditeljski račun.',
      code: 'PARENT_LINK_CONFIRM',
      parentLink: {
        email: 'roditelj@example.com',
        previousEmail: 'stari@example.com',
        staffName: null,
        otherChildren: [],
        otherCityChildren: 0,
      },
    })
  })

  function submitButton() {
    const buttons = screen.getAllByRole('button', { name: /Kreiraj račun i upiši|Potvrdi i kreiraj/ })
    return buttons[buttons.length - 1]
  }

  // Radix never calls onOpenChange for a programmatic close, so Odustani used
  // to leave the preview behind: the reopened dialog read "Potvrdi i kreiraj"
  // and its first click sent confirmParentLink: true for a preview the admin
  // had walked away from, instead of asking the server again.
  it('Odustani forgets the preview, so the reopened dialog asks the server again', async () => {
    openDialog()
    fireEvent.click(submitButton())

    await screen.findByRole('button', { name: 'Potvrdi i kreiraj' })
    expect(screen.getByText('Roditeljski račun')).toBeInTheDocument()
    expect(createMock).toHaveBeenLastCalledWith('inq-1', 'g-reserved', undefined, false)

    fireEvent.click(screen.getByRole('button', { name: 'Odustani' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Kreiraj račun i upiši' }))
    await screen.findByRole('dialog')
    expect(screen.queryByText('Roditeljski račun')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Potvrdi i kreiraj' })).not.toBeInTheDocument()

    fireEvent.click(submitButton())
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2))
    expect(createMock).toHaveBeenLastCalledWith('inq-1', 'g-reserved', undefined, false)
  })
})
