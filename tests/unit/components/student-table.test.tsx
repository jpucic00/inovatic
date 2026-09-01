import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudentTable } from '@/components/admin/students/student-table'
import type { StudentRow } from '@/actions/admin/student'

function enrollment(id: string, schoolYear: string, label: string): StudentRow['enrollments'][number] {
  return {
    id,
    schoolYear,
    fullYearPaidAt: null,
    scheduledGroup: {
      id: `sg-${id}`,
      name: label,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      course: { id: 'c-1', title: 'Svijet LEGO Robotike 2', kind: 'STANDARD' },
      location: { name: 'Velebitska 32' },
    },
    moduleEnrollments: [],
  }
}

const TWO_YEAR_ROW: StudentRow = {
  id: 's-1',
  firstName: 'Pero',
  lastName: 'Perić',
  username: 'pero.peric',
  dateOfBirth: '2016-04-10',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  paymentStatus: 'NOT_DUE',
  isReturning: true,
  enrollments: [
    enrollment('e-old', '2025/2026', 'Stara grupa'),
    enrollment('e-new', '2026/2027', 'Nova grupa'),
  ],
}

describe('StudentTable — every year-sensitive cell follows the scoped year', () => {
  it('chips only the scoped year\'s groups, even though enrollments carry all years', () => {
    // `enrollments` deliberately spans years (the payment status reads debt
    // across all of them); the Grupe cell must answer "where is this kid NOW".
    render(<StudentTable data={[TWO_YEAR_ROW]} schoolYear="2026/2027" />)

    expect(screen.getByText('Nova grupa')).toBeTruthy()
    expect(screen.queryByText('Stara grupa')).toBeNull()
  })

  it('names the scoped year in the Ponovni upis header', () => {
    render(<StudentTable data={[TWO_YEAR_ROW]} schoolYear="2026/2027" />)

    expect(
      screen.getByRole('columnheader', { name: /Ponovni upis \(2026\/2027\)/ }),
    ).toBeTruthy()
  })

  it('names the scoped year in the empty state, so an unfilled year does not read as missing data', () => {
    render(<StudentTable data={[]} schoolYear="2026/2027" />)

    expect(screen.getByText('Nema učenika upisanih u 2026/2027.')).toBeTruthy()
  })
})
