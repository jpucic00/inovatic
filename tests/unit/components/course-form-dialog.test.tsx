/**
 * The Uredi dialog is shared by radionice and the natjecateljski program (the
 * only two editable kinds). Cijena is a radionica's single up-front fee, so it
 * is not offered on the program — and hiding an input must not silently blank
 * the column, which is the half that is easy to get wrong.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ProgramKind } from '@prisma/client'
import { CourseFormDialog } from '@/components/admin/courses/course-form-dialog'

const updateCourse = vi.fn<(input: unknown) => Promise<{ success: true }>>(() =>
  Promise.resolve({ success: true }),
)

vi.mock('@/actions/admin/course', () => ({
  createCourse: vi.fn(async () => ({ success: true })),
  updateCourse: (input: unknown) => updateCourse(input),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function openDialog(kind: ProgramKind, price: number | null) {
  render(
    <CourseFormDialog
      course={{
        id: 'course-1',
        title: kind === 'RADIONICA' ? 'Ljetne radionice' : 'Natjecateljski program',
        description: 'Opis programa',
        ageMin: 10,
        ageMax: 19,
        price,
        kind,
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Uredi' }))
}

beforeEach(() => {
  updateCourse.mockClear()
})

describe('CourseFormDialog', () => {
  it('offers the price on a radionica', () => {
    openDialog('RADIONICA', 80)
    expect(screen.getByLabelText('Cijena radionice (€)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Uredi radionicu' })).toBeInTheDocument()
  })

  it('hides the price on the natjecateljski program', () => {
    openDialog('COMPETITION', null)
    expect(screen.queryByLabelText('Cijena radionice (€)')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Uredi program' })).toBeInTheDocument()
  })

  // The field is hidden, not dropped: a stored price has to survive a save it
  // was never shown in, or editing the title would wipe it.
  it('keeps a stored price when the field is not rendered', async () => {
    openDialog('COMPETITION', 25)
    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))

    await waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1))
    expect(updateCourse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'course-1', ageMax: 19, price: 25 }),
    )
  })
})
