import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { ActiveProgram } from '@/actions/public/programs'
import { InquiryForm } from '@/components/public/inquiry-form'

// Keep the form off the server: mock the action, stub the availability poll to
// a no-op so the server-rendered per-city programs stay put, and stub next/link.
vi.mock('@/actions/inquiry', () => ({ submitInquiry: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

function makeProgram(id: string, groupId: string, groupName: string): ActiveProgram {
  return {
    id,
    slug: id,
    title: `Program ${id}`,
    level: 'SLR_1',
    kind: 'STANDARD' as const,
    ageMin: 6,
    ageMax: 8,
    price: 50,
    groups: [
      {
        id: groupId,
        name: groupName,
        dayOfWeek: 'Ponedjeljak',
        dateStart: null,
        dateEnd: null,
        startTime: '17:00',
        endTime: '18:00',
        availableSpots: 5,
        isFull: false, trialDate: null,
      },
    ],
  }
}

const splitProgram = makeProgram('course-split', 'grp-split', 'Split Grupa')
const sibProgram = makeProgram('course-sib', 'grp-sib', 'Šibenik Grupa')

async function fillStep1AndAdvance(user: ReturnType<typeof userEvent.setup>, city: string) {
  await user.selectOptions(screen.getByLabelText(/Grad/), city)
  await user.type(screen.getByLabelText(/Ime i prezime/), 'Ana Anić')
  await user.type(screen.getByLabelText(/Email adresa/), 'ana@example.com')
  await user.type(screen.getByLabelText(/Broj telefona/), '0912345678')
  await user.click(screen.getByRole('button', { name: /Dalje/ }))
  await screen.findByRole('heading', { name: 'Podaci o djetetu' })
}

async function fillStep2AndAdvance(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
) {
  await user.type(screen.getByLabelText(/^Ime/), 'Luka')
  await user.type(screen.getByLabelText(/Prezime/), 'Anić')
  await user.selectOptions(container.querySelector('#dob-day')!, '15')
  await user.selectOptions(container.querySelector('#dob-month')!, '06')
  await user.selectOptions(container.querySelector('#dob-year')!, '2015')
  await user.click(screen.getByRole('button', { name: /Dalje/ }))
  await screen.findByRole('heading', { name: 'Dostupni termini' })
}

describe('InquiryForm — changing city clears a stale Step-3 selection', () => {
  it('drops the previously chosen course/group when the city switches', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <InquiryForm programsByCity={{ SPLIT: [splitProgram], SIBENIK: [sibProgram] }} />,
    )

    // Reach Step 3 as a Split parent and pick the Split group.
    await fillStep1AndAdvance(user, 'SPLIT')
    await fillStep2AndAdvance(user, container)
    await user.selectOptions(screen.getByLabelText(/Razred djeteta/), '1')
    const groupSelect = screen.getByLabelText(/Željeni termin/) as HTMLSelectElement
    await user.selectOptions(groupSelect, 'course-split|grp-split')
    expect(groupSelect.value).toBe('course-split|grp-split')

    // Back to Step 1 and switch the city to Šibenik.
    await user.click(screen.getByRole('button', { name: /Nazad/ }))
    await screen.findByRole('heading', { name: 'Podaci o djetetu' })
    await user.click(screen.getByRole('button', { name: /Nazad/ }))
    await screen.findByRole('heading', { name: /Podaci o roditelju/ })
    await user.selectOptions(screen.getByLabelText(/Grad/), 'SIBENIK')

    // Forward again to Step 3 — the Split group is gone and nothing is selected.
    await user.click(screen.getByRole('button', { name: /Dalje/ }))
    await screen.findByRole('heading', { name: 'Podaci o djetetu' })
    await user.click(screen.getByRole('button', { name: /Dalje/ }))
    await screen.findByRole('heading', { name: 'Dostupni termini' })

    const groupSelectAfter = screen.getByLabelText(/Željeni termin/) as HTMLSelectElement
    expect(groupSelectAfter.value).toBe('')
    expect(screen.queryByRole('option', { name: /Split Grupa/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Šibenik Grupa/ })).toBeInTheDocument()
  })
})
