import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssessmentReadonly } from '@/components/portal/assessment-readonly'
import type { StudentAssessmentReadonly } from '@/actions/student/assessment'

const base: StudentAssessmentReadonly = {
  slaganje: 'OSTVARENO',
  programiranje: 'U_RAZVOJU',
  inovacije: 'POCETNO',
  suradnja: 'OSTVARENO',
  komunikacija: 'U_RAZVOJU',
  zabava: 'OSTVARENO',
  opisnaOcjena: 'Vrlo motiviran polaznik.',
  recommendationLabel: 'Svijet LEGO robotike 2',
  updatedAt: new Date('2027-06-15T10:00:00Z'),
  authorName: 'Ana Anić',
}

describe('AssessmentReadonly', () => {
  // Queried by ROLE, not by getByLabelText: the latter reads the raw attribute,
  // so it passed even while the levels were unreachable to a screen reader —
  // `aria-label` on a plain <div> (role `generic`) is dropped by browsers. Only
  // a role that permits a name exposes them, and only getByRole proves it.
  it('exposes every skill level to assistive tech, not just as an attribute', () => {
    render(<AssessmentReadonly assessment={base} />)

    expect(screen.getByRole('img', { name: 'Slaganje: Ostvareno' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Programiranje: U razvoju' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Inovacije: Početno' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Suradnja: Ostvareno' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Komunikacija: U razvoju' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Zabava: Ostvareno' })).toBeTruthy()
  })

  it('renders the descriptive grade, preporuka and author line', () => {
    render(<AssessmentReadonly assessment={base} />)

    expect(screen.getByText('Vrlo motiviran polaznik.')).toBeTruthy()
    expect(screen.getByText('Preporuka mentora')).toBeTruthy()
    expect(screen.getByText('Svijet LEGO robotike 2')).toBeTruthy()
    expect(screen.getByText(/Ana Anić/)).toBeTruthy()
    expect(screen.getByText(/15\.06\.2027\./)).toBeTruthy()
  })

  it('marks an ungraded skill instead of showing a level', () => {
    render(<AssessmentReadonly assessment={{ ...base, slaganje: null }} />)

    expect(screen.queryByLabelText(/^Slaganje:/)).toBeNull()
    expect(screen.getByText('Nije ocijenjeno')).toBeTruthy()
  })

  it('drops the opisna and preporuka blocks when both are absent', () => {
    render(
      <AssessmentReadonly
        assessment={{ ...base, opisnaOcjena: null, recommendationLabel: null }}
      />,
    )

    expect(screen.queryByText('Opisna ocjena')).toBeNull()
    expect(screen.queryByText('Preporuka mentora')).toBeNull()
  })

  it('never renders an editing control', () => {
    render(<AssessmentReadonly assessment={base} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})
