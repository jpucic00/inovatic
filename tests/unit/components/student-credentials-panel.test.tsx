/**
 * The "Pristupni podaci" card on the shared student detail view. Two rules are
 * load-bearing: the password reset is ADMIN-only (teachers still *read* the
 * password by design — see student-detail-payload-scope.test.ts), and the
 * button labels itself for the imported-account case, where there is no
 * password to reset yet, only a first one to generate.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { StudentDetail } from '@/lib/student-detail'
import { StudentDetailView } from '@/components/shared/student-detail-view'

// Heavy children pull server actions and next/navigation — stub them out; this
// test is only about the credentials card.
vi.mock('@/components/shared/student-year-sections', () => ({
  StudentYearSections: () => <div data-testid="year-sections" />,
}))
vi.mock('@/components/admin/students/edit-student-dialog', () => ({
  EditStudentDialog: () => <div data-testid="edit-dialog" />,
}))
vi.mock('@/components/admin/students/delete-student-dialog', () => ({
  DeleteStudentDialog: () => <div data-testid="delete-dialog" />,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/admin/student', () => ({ resetStudentPassword: vi.fn() }))

function makeStudent(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: 'stud-1',
    firstName: 'Fabijan',
    lastName: 'Kokić',
    username: 'fabijankokic',
    plainPassword: 'margka',
    createdAt: new Date('2026-07-20'),
    enrollments: [],
    moduleEnrollments: [],
    ...overrides,
  } as unknown as StudentDetail
}

function renderView(props: Partial<ComponentProps<typeof StudentDetailView>> = {}) {
  return render(
    <StudentDetailView
      viewerRole="ADMIN"
      student={makeStudent()}
      attendance={[]}
      gradebookTabs={[]}
      recommendationOptions={[]}
      courses={[]}
      defaultYear="2025/2026"
      backHref="/admin/ucenici"
      backLabel="Natrag na učenike"
      onCreateComment={vi.fn()}
      onDeleteComment={vi.fn()}
      onSaveAssessment={vi.fn()}
      onClearAssessment={vi.fn()}
      {...props}
    />,
  )
}

describe('student credentials card', () => {
  it('offers an admin a reset on an account that already has a password', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Resetiraj lozinku' })).toBeInTheDocument()
    expect(screen.getByText('margka')).toBeInTheDocument()
  })

  it('offers an admin a first-password generate on an imported account', () => {
    renderView({ student: makeStudent({ plainPassword: null }) })
    expect(screen.getByRole('button', { name: 'Generiraj lozinku' })).toBeInTheDocument()
    expect(screen.getByText('Nije dostupna')).toBeInTheDocument()
  })

  it('hides the reset from a teacher while still showing the password', () => {
    renderView({ viewerRole: 'TEACHER' })
    // Narrow to the reset labels — the teacher keeps the "Kopiraj lozinku"
    // copy affordance, which is the by-design read access.
    expect(
      screen.queryByRole('button', { name: /^(Resetiraj|Generiraj) lozinku$/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('margka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopiraj lozinku' })).toBeInTheDocument()
  })
})
