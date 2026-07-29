import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssessmentReadonly } from '@/components/portal/assessment-readonly'
import type { StudentAssessmentReadonly } from '@/actions/student/assessment'

const base: StudentAssessmentReadonly = {
  slaganje: 'OSTVARENO',
  razradaIdeja: null,
  izvedivost: null,
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
    render(<AssessmentReadonly assessment={base} kind="STANDARD" />)

    expect(screen.getByText('Slaganje: Ostvareno')).toBeTruthy()
    expect(screen.getByText('Programiranje: U razvoju')).toBeTruthy()
    expect(screen.getByText('Inovacije: Početno')).toBeTruthy()
    expect(screen.getByText('Suradnja: Ostvareno')).toBeTruthy()
    expect(screen.getByText('Komunikacija: U razvoju')).toBeTruthy()
    expect(screen.getByText('Zabava: Ostvareno')).toBeTruthy()
  })

  it('renders the descriptive grade, preporuka and author line', () => {
    render(<AssessmentReadonly assessment={base} kind="STANDARD" />)

    expect(screen.getByText('Vrlo motiviran polaznik.')).toBeTruthy()
    expect(screen.getByText('Preporuka mentora')).toBeTruthy()
    expect(screen.getByText('Svijet LEGO robotike 2')).toBeTruthy()
    expect(screen.getByText(/Ana Anić/)).toBeTruthy()
    expect(screen.getByText(/15\.06\.2027\./)).toBeTruthy()
  })

  it('marks an ungraded skill instead of showing a level', () => {
    render(<AssessmentReadonly assessment={{ ...base, slaganje: null }} kind="STANDARD" />)

    expect(screen.queryByLabelText(/^Slaganje:/)).toBeNull()
    expect(screen.getByText('Nije ocijenjeno')).toBeTruthy()
  })

  it('drops the opisna and preporuka blocks when both are absent', () => {
    render(
      <AssessmentReadonly assessment={{ ...base, opisnaOcjena: null, recommendationLabel: null }} kind="STANDARD" />,
    )

    expect(screen.queryByText('Opisna ocjena')).toBeNull()
    expect(screen.queryByText('Preporuka mentora')).toBeNull()
  })

  it('never renders an editing control', () => {
    render(<AssessmentReadonly assessment={base} kind="STANDARD" />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})

describe('rubric per program kind', () => {
  it('renders the SLR practical skills for a standard group', () => {
    render(<AssessmentReadonly assessment={base} kind="STANDARD" />)

    expect(screen.getByText('Slaganje')).toBeTruthy()
    expect(screen.getByText('Programiranje')).toBeTruthy()
    expect(screen.queryByText('Razrada ideja')).toBeNull()
    expect(screen.queryByText('Izvedivost')).toBeNull()
  })

  it('swaps in the competition practical skills, keeping Inovacije and the team ones', () => {
    render(
      <AssessmentReadonly
        assessment={{
          ...base,
          slaganje: null,
          programiranje: null,
          razradaIdeja: 'OSTVARENO',
          izvedivost: 'U_RAZVOJU',
        }}
        kind="COMPETITION"
      />,
    )

    expect(screen.getByText('Razrada ideja')).toBeTruthy()
    expect(screen.getByText('Izvedivost')).toBeTruthy()
    // Shared across both rubrics.
    expect(screen.getByText('Inovacije')).toBeTruthy()
    expect(screen.getByText('Suradnja')).toBeTruthy()
    expect(screen.getByText('Komunikacija')).toBeTruthy()
    expect(screen.getByText('Zabava')).toBeTruthy()
    // The SLR pair must not appear — a competition row never holds them.
    expect(screen.queryByText('Slaganje')).toBeNull()
    expect(screen.queryByText('Programiranje')).toBeNull()
  })

  it('announces the competition grades to assistive tech like the SLR ones', () => {
    render(
      <AssessmentReadonly
        assessment={{ ...base, razradaIdeja: 'OSTVARENO', izvedivost: 'POCETNO' }}
        kind="COMPETITION"
      />,
    )

    expect(screen.getByText('Razrada ideja: Ostvareno')).toBeTruthy()
    expect(screen.getByText('Izvedivost: Početno')).toBeTruthy()
  })
})
