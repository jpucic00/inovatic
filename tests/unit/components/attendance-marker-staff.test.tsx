import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AttendanceMarker } from '@/components/teacher/attendance-marker'
import { bulkMarkSession } from '@/actions/teacher/attendance'
import type { GroupAttendance } from '@/actions/teacher/attendance'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/teacher/attendance', () => ({
  bulkMarkSession: vi.fn(async () => ({ success: true as const })),
}))

const SESSIONS = ['2020-01-06', '2020-01-07', '2020-01-08']
// Past dates, so the marker opens on the newest one.
const SELECTED = '2020-01-08'

const IVO = { userId: 'ivo', name: 'Ivo Horvat', role: 'LEAD' as const }
const ANA = { userId: 'ana', name: 'Ana Kovač', role: 'ASSISTANT' as const }

function props(staffChanges: GroupAttendance['staffChanges']): GroupAttendance {
  return {
    kind: 'custom',
    groupId: 'g-1',
    schoolYear: '2019/2020',
    dayOfWeek: null,
    dateStart: '2020-01-06',
    dateEnd: '2020-01-08',
    startTime: '10:00',
    endTime: '13:00',
    expectedSessions: SESSIONS,
    extraSessions: [],
    roster: [{ enrollmentId: 'e-1', studentId: 's-1', firstName: 'Luka', lastName: 'Babić' }],
    records: [],
    teachers: [
      { userId: 'ivo', name: 'Ivo Horvat' },
      { userId: 'ana', name: 'Ana Kovač' },
      { userId: 'marko', name: 'Marko Marić' },
    ],
    regularStaff: [IVO, ANA],
    staffChanges,
    teacherRecords: [],
    markingWindow: null,
  }
}

const SUBSTITUTE = {
  sessionDate: SELECTED,
  userId: 'marko',
  name: 'Marko Marić',
  role: 'LEAD' as const,
  replacesUserId: 'ivo',
  replacesName: 'Ivo Horvat',
}

beforeEach(() => vi.mocked(bulkMarkSession).mockClear())

describe('AttendanceMarker — staff on a termin', () => {
  it('shows each regular with their role', () => {
    render(<AttendanceMarker {...props([])} />)
    expect(screen.getByRole('checkbox', { name: /Ivo Horvat\s*Predavač/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Ana Kovač\s*Asistent/ })).toBeInTheDocument()
  })

  it('puts the substitute in place of the replaced teacher on that date only', () => {
    render(<AttendanceMarker {...props([SUBSTITUTE])} />)
    expect(
      screen.getByRole('checkbox', { name: /Marko Marić.*Zamjena · umjesto: Ivo Horvat/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Ivo Horvat\s*Predavač/ })).not.toBeInTheDocument()
  })

  it('books the substitute, not the replaced teacher, on save', async () => {
    render(<AttendanceMarker {...props([SUBSTITUTE])} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Babić/ }))
    fireEvent.click(screen.getByRole('button', { name: /Spremi evidenciju/ }))
    await waitFor(() => expect(bulkMarkSession).toHaveBeenCalled())
    const input = vi.mocked(bulkMarkSession).mock.calls[0][0]
    expect(input.teacherEntries?.map((t) => t.userId).sort()).toEqual(['ana', 'marko'])
  })

  it('leaves a change on another date out of this termin', () => {
    render(<AttendanceMarker {...props([{ ...SUBSTITUTE, sessionDate: '2020-01-07' }])} />)
    expect(screen.getByRole('checkbox', { name: /Ivo Horvat\s*Predavač/ })).toBeInTheDocument()
    expect(screen.queryByText('Marko Marić')).not.toBeInTheDocument()
  })
})
