/**
 * The "Pristup portalu" card on the shared student detail view. What it must
 * never do is show a password — none is stored readably since 2026-09-29. What
 * it must do is name the parent login, say whether the parent has chosen a
 * password, and offer the link to anyone who can open the profile (admin AND
 * teacher, by owner decision).
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
vi.mock('@/actions/password-link', () => ({
  sendParentPasswordLink: vi.fn(),
  sendStaffPasswordLink: vi.fn(),
}))

function makeStudent(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: 'stud-1',
    firstName: 'Fabijan',
    lastName: 'Kokić',
    parentAccount: {
      email: 'roditelj@example.com',
      passwordSetAt: null,
      credentialsSentAt: null,
      _count: { children: 2 },
    },
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
      onSetContractSigned={vi.fn()}
      {...props}
    />,
  )
}

describe('portal access card', () => {
  it('names the parent login and offers an admin the link', () => {
    renderView()
    expect(screen.getByText('roditelj@example.com')).toBeInTheDocument()
    expect(screen.getByText(/2 djeteta na računu/)).toBeInTheDocument()
    expect(screen.getByText('Još nije postavljena')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pošalji poveznicu za lozinku' }),
    ).toBeInTheDocument()
  })

  it('offers a teacher the same link', () => {
    renderView({ viewerRole: 'TEACHER' })
    expect(
      screen.getByRole('button', { name: 'Pošalji poveznicu za lozinku' }),
    ).toBeInTheDocument()
  })

  it('says when the parent has already chosen a password', () => {
    renderView({
      student: makeStudent({
        parentAccount: {
          email: 'roditelj@example.com',
          passwordSetAt: new Date('2026-09-20'),
          credentialsSentAt: new Date('2026-09-18'),
          _count: { children: 1 },
        },
      }),
    })
    expect(screen.getByText(/Postavljena 20\.09\.2026\./)).toBeInTheDocument()
    expect(screen.getByText(/poveznica poslana 18\.09\.2026\./)).toBeInTheDocument()
  })

  it('offers nothing to send to when the child has no parent login', () => {
    renderView({ student: makeStudent({ parentAccount: null }) })
    expect(screen.getByText(/portal nije dostupan/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pošalji poveznicu za lozinku' }),
    ).not.toBeInTheDocument()
  })

  it('never renders a password row', () => {
    renderView()
    expect(screen.queryByText('Lozinka')).not.toBeInTheDocument()
    expect(screen.queryByText('Korisničko ime')).not.toBeInTheDocument()
  })
})
