/**
 * The success screen closes with the same promise the confirmation e-mail makes,
 * from the same shared copy. It used to tell every parent "kontaktirat ćemo vas
 * s dostupnim terminima" — including the one who had just picked a termin from
 * the dropdown two clicks earlier.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { ActiveProgram } from '@/actions/public/programs'
import { InquiryForm } from '@/components/public/inquiry-form'
import { submitInquiry } from '@/actions/inquiry'

vi.mock('@/actions/inquiry', () => ({ submitInquiry: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

const submitMock = vi.mocked(submitInquiry)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  submitMock.mockReset()
  // The server decides which sentence the success screen shows, so each test
  // mocks the step it is asserting on.
  submitMock.mockResolvedValue({ success: true, nextStep: 'TERMIN_TO_OFFER' })
})

const program: ActiveProgram = {
  id: 'course-1',
  slug: 'course-1',
  title: 'Program 1',
  level: 'SLR_1',
  kind: 'STANDARD',
  ageMin: 6,
  ageMax: 8,
  price: 50,
  groups: [
    {
      id: 'grp-1',
      name: 'Ponedjeljkom',
      dayOfWeek: 'Ponedjeljak',
      dateStart: null,
      dateEnd: null,
      startTime: '17:00',
      endTime: '18:00',
      availableSpots: 5,
      isFull: false,    },
  ],
}

/** Fills steps 1–2 and lands on Step 3 with the razred already chosen. */
async function reachStep3(programs: ActiveProgram[]) {
  const user = userEvent.setup()
  const { container } = render(<InquiryForm programsByCity={{ SPLIT: programs }} />)

  await user.selectOptions(screen.getByLabelText(/Grad/), 'SPLIT')
  await user.type(screen.getByLabelText(/Ime i prezime/), 'Ana Anić')
  await user.type(screen.getByLabelText(/Email adresa/), 'ana@example.com')
  await user.type(screen.getByLabelText(/Broj telefona/), '0912345678')
  await user.click(screen.getByRole('button', { name: /Dalje/ }))
  await screen.findByRole('heading', { name: 'Podaci o djetetu' })

  await user.type(screen.getByLabelText(/^Ime/), 'Luka')
  await user.type(screen.getByLabelText(/Prezime/), 'Anić')
  await user.selectOptions(container.querySelector('#dob-day')!, '15')
  await user.selectOptions(container.querySelector('#dob-month')!, '06')
  await user.selectOptions(container.querySelector('#dob-year')!, '2015')
  await user.click(screen.getByRole('button', { name: /Dalje/ }))
  await screen.findByRole('heading', { name: 'Dostupni termini' })

  await user.selectOptions(screen.getByLabelText(/Razred djeteta/), '1')
  return user
}

const submitAndAwaitSuccess = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: /Pošalji/ }))
  await screen.findByRole('heading', { name: /Upit je poslan/ })
}

describe('InquiryForm success screen', () => {
  it('confirms the booked termin when the parent picked one', async () => {
    submitMock.mockResolvedValue({ success: true, nextStep: 'TERMIN_CHOSEN' })
    const user = await reachStep3([program])
    await user.selectOptions(screen.getByLabelText(/Željeni termin/), 'course-1|grp-1')

    await submitAndAwaitSuccess(user)

    expect(screen.getByText(/Vaš odabrani termin je zabilježen/)).toBeInTheDocument()
    expect(screen.queryByText(/dostupnim terminima/)).not.toBeInTheDocument()
  })

  it('still offers termini when the razred had none to pick', async () => {
    // No open program for this grade, so the dropdown has nothing in it and the
    // parent really is waiting on us for dates.
    const user = await reachStep3([])

    await submitAndAwaitSuccess(user)

    expect(screen.getByText(/kontaktirati vas s dostupnim terminima/)).toBeInTheDocument()
    expect(screen.queryByText(/Vaš odabrani termin je zabilježen/)).not.toBeInTheDocument()
  })

})
