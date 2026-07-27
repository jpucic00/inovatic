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
  updatedAtLabel: '15.06.2027.',
  authorName: 'Ana Anić',
}

describe('AssessmentReadonly', () => {
  // Asserted as real TEXT, not via getByLabelText: the latter reads the raw
  // attribute, so it passed even while the levels were unreachable to a screen
  // reader — `aria-label` on a plain <div> (role `generic`) is dropped by
  // browsers. Visually hidden text is in the accessibility tree by construction,
  // needs no role, and `getByText` proves it is actually rendered.
  it('exposes every skill level to assistive tech, not just as an attribute', () => {
    render(<AssessmentReadonly assessment={base} />)

    expect(screen.getByText('Slaganje: Ostvareno')).toBeTruthy()
    expect(screen.getByText('Programiranje: U razvoju')).toBeTruthy()
    expect(screen.getByText('Inovacije: Početno')).toBeTruthy()
    expect(screen.getByText('Suradnja: Ostvareno')).toBeTruthy()
    expect(screen.getByText('Komunikacija: U razvoju')).toBeTruthy()
    expect(screen.getByText('Zabava: Ostvareno')).toBeTruthy()
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
