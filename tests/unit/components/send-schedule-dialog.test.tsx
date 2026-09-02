/**
 * Twin of create-account-dialog.test.tsx for the OTHER upit dialog. The
 * reservation label and the `reservedByThisInquiry` mapping are an inline copy
 * here (no shared mapper), and the refetch is its own getGroupsForCourse call —
 * so dropping the inquiry id from that call, or the field from the map, would
 * regress silently while the create-account tests stay green.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SendScheduleDialog } from '@/components/admin/inquiries/send-schedule-dialog'

const RESERVED_NOTE = 'uključuje mjesto rezervirano za ovo dijete'

const baseGroup = {
  name: null,
  dayOfWeek: 'Utorak',
  dateStart: null,
  dateEnd: null,
  startTime: '18:00',
  endTime: '19:30',
  location: { name: 'Velebitska 32' },
  course: { kind: 'STANDARD' as const },
}

const { getGroupsForCourse } = vi.hoisted(() => ({
  getGroupsForCourse: vi.fn(async () => [
    { ...baseGroup, id: 'g-reserved', availableSpots: 1, isFull: false, reservedByThisInquiry: true },
    { ...baseGroup, id: 'g-full', availableSpots: 0, isFull: true, reservedByThisInquiry: false },
  ]),
}))
vi.mock('@/actions/admin/inquiry', () => ({
  getGroupsForCourse,
  sendScheduleOptions: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function openDialog() {
  render(
    <SendScheduleDialog
      inquiryId="inq-1"
      childName="Ana Anić"
      initialGroups={[]}
      courses={[
        { id: 'c-1', title: 'Svijet LEGO Robotike 1' },
        { id: 'c-2', title: 'Svijet LEGO Robotike 2' },
      ]}
      preferredCourseId="c-1"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pošalji raspored' }))
}

describe('SendScheduleDialog — mjesto rezervirano ovim upitom', () => {
  it('refetches with the inquiry id when the program changes', async () => {
    openDialog()
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: 'c-2' } })
    await waitFor(() => expect(getGroupsForCourse).toHaveBeenCalledWith('c-2', 'inq-1'))
  })

  it('labels only the reservation-freed group, and a full group stays offerable', async () => {
    openDialog()
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: 'c-2' } })
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2))
    expect(screen.getAllByText(RESERVED_NOTE)).toHaveLength(1)
    expect(screen.getByText('Popunjeno')).toBeInTheDocument()
    // Unlike the create-account dialog, a full group may still be OFFERED —
    // sending termini is a conversation, not an enrollment.
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeDisabled()
  })
})
