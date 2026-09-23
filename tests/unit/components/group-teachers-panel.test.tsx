import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GroupTeachersPanel } from '@/components/admin/groups/group-teachers-panel'
import {
  addSessionStaffChange,
  getGroupTerminSections,
  type GroupStaffChangeRow,
} from '@/actions/admin/session-staff'
import type { TerminSection } from '@/lib/session-staff'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/actions/admin/teacher', () => ({
  assignTeacherToGroup: vi.fn(async () => ({ success: true })),
  unassignTeacherFromGroup: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/actions/admin/session-staff', () => ({
  getGroupTerminSections: vi.fn(),
  addSessionStaffChange: vi.fn(async () => ({ success: true })),
  removeSessionStaffChange: vi.fn(async () => ({ success: true })),
  setTeacherAssignmentRole: vi.fn(async () => ({ success: true })),
}))

const loadSections = vi.mocked(getGroupTerminSections)
const addChange = vi.mocked(addSessionStaffChange)

const person = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  email: `${id}@test.hr`,
})
const IVO = person('ivo', 'Ivo', 'Horvat')
const MARKO = person('marko', 'Marko', 'Marić')
const PETRA = person('petra', 'Petra', 'Perić')

const SECTIONS: TerminSection[] = [
  { title: 'Modul 1: Zabavni sustavi', dates: ['2026-10-13', '2026-10-20'] },
  { title: 'Modul 2: Pametni gradovi', dates: ['2026-11-03'] },
]

const change = (over: Partial<GroupStaffChangeRow>): GroupStaffChangeRow => ({
  id: `c-${over.sessionDate ?? '2026-10-13'}-${over.userId ?? 'marko'}`,
  sessionDate: '2026-10-13',
  userId: 'marko',
  name: 'Marko Marić',
  role: 'LEAD',
  replacesUserId: 'ivo',
  replacesName: 'Ivo Horvat',
  ...over,
})

function renderPanel(changes: GroupStaffChangeRow[] = []) {
  return render(
    <GroupTeachersPanel
      groupId="g1"
      assignments={[{ id: 'a1', role: 'LEAD', user: IVO }]}
      assignableTeachers={[]}
      people={[IVO, MARKO, PETRA]}
      changes={changes}
      editable
    />,
  )
}

async function openSubstituteDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj zamjenu' }))
  return screen.findByRole('dialog')
}

/** A deferred promise, so a test can look at the dialog before the load settles. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  loadSections.mockReset()
  addChange.mockClear()
})

describe('GroupTeachersPanel — Dodaj zamjenu termini', () => {
  it('shows a loading state, then one block per module with a checkbox per date', async () => {
    const load = deferred<TerminSection[]>()
    loadSections.mockReturnValue(load.promise)
    renderPanel()

    const dialog = await openSubstituteDialog()
    expect(loadSections).toHaveBeenCalledWith('g1')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Učitavam termine...')
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0)

    load.resolve(SECTIONS)
    expect(await within(dialog).findByText('Modul 1: Zabavni sustavi')).toBeInTheDocument()
    expect(within(dialog).getByText('Modul 2: Pametni gradovi')).toBeInTheDocument()
    expect(within(dialog).queryByRole('status')).toBeNull()
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3)
    for (const name of ['13.10.2026.', '20.10.2026.', '03.11.2026.']) {
      expect(within(dialog).getByRole('checkbox', { name })).toBeEnabled()
    }
  })

  it('says so inline when the termini cannot be loaded', async () => {
    loadSections.mockRejectedValue(new Error('boom'))
    renderPanel()

    const dialog = await openSubstituteDialog()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Termine nije moguće učitati')
    expect(within(dialog).queryByRole('status')).toBeNull()
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('disables a date either person already has a change on, and names why', async () => {
    loadSections.mockResolvedValue([
      { title: 'Modul 1: Zabavni sustavi', dates: ['2026-10-13', '2026-10-20', '2026-10-27'] },
    ])
    renderPanel([
      change({ sessionDate: '2026-10-13', userId: 'marko', replacesUserId: 'ivo' }),
      change({
        sessionDate: '2026-10-20',
        userId: 'petra',
        name: 'Petra Perić',
        replacesUserId: null,
        replacesName: null,
      }),
    ])
    const dialog = await openSubstituteDialog()
    await within(dialog).findByText('Modul 1: Zabavni sustavi')

    fireEvent.change(within(dialog).getByLabelText('Umjesto'), { target: { value: 'ivo' } })
    fireEvent.change(within(dialog).getByLabelText('Tko dolazi'), { target: { value: 'petra' } })

    const replaced = within(dialog).getByRole('checkbox', { name: /13\.10\.2026\./ })
    expect(replaced).toBeDisabled()
    expect(replaced).toHaveAccessibleName(/^13\.10\.2026\.\s*— na ovom terminu već ima zamjenu$/)

    const busy = within(dialog).getByRole('checkbox', { name: /20\.10\.2026\./ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAccessibleName(/^20\.10\.2026\.\s*— na ovom terminu već ima promjenu$/)

    expect(within(dialog).getByRole('checkbox', { name: '27.10.2026.' })).toBeEnabled()
  })

  it('submits dates ticked across modules in one call', async () => {
    loadSections.mockResolvedValue(SECTIONS)
    renderPanel()
    const dialog = await openSubstituteDialog()
    await within(dialog).findByText('Modul 1: Zabavni sustavi')

    fireEvent.change(within(dialog).getByLabelText('Umjesto'), { target: { value: 'ivo' } })
    fireEvent.change(within(dialog).getByLabelText('Tko dolazi'), { target: { value: 'marko' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '13.10.2026.' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '03.11.2026.' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj za 2 termina' }))

    await waitFor(() => expect(addChange).toHaveBeenCalledTimes(1))
    expect(addChange).toHaveBeenCalledWith({
      scheduledGroupId: 'g1',
      sessionDates: ['2026-10-13', '2026-11-03'],
      userId: 'marko',
      role: 'LEAD',
      replacesUserId: 'ivo',
    })
  })

  it('sends an empty replacesUserId for Nikoga, dodatno na terminu', async () => {
    loadSections.mockResolvedValue(SECTIONS)
    renderPanel()
    const dialog = await openSubstituteDialog()
    await within(dialog).findByText('Modul 1: Zabavni sustavi')

    const replaces = within(dialog).getByLabelText('Umjesto')
    fireEvent.change(replaces, { target: { value: 'ivo' } })
    fireEvent.change(replaces, { target: { value: '' } })
    expect(within(replaces).getByRole('option', { selected: true })).toHaveTextContent(
      '– Nikoga, dodatno na terminu –',
    )
    fireEvent.change(within(dialog).getByLabelText('Tko dolazi'), { target: { value: 'petra' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '20.10.2026.' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj zamjenu' }))

    await waitFor(() => expect(addChange).toHaveBeenCalledTimes(1))
    expect(addChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'petra', sessionDates: ['2026-10-20'], replacesUserId: '' }),
    )
  })
})

describe('GroupTeachersPanel — substitute rows', () => {
  it('lists no substitute when no change is passed in', () => {
    renderPanel([])
    expect(screen.getByRole('link', { name: 'Ivo Horvat' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Marko Marić' })).toBeNull()
    expect(screen.queryByText(/Zamjena · umjesto/)).toBeNull()
  })

  it('renders one row per substitute, with each termin as a chip', () => {
    renderPanel([
      change({ id: 'c2', sessionDate: '2026-10-20' }),
      change({ id: 'c1', sessionDate: '2026-10-13' }),
    ])

    const links = screen.getAllByRole('link', { name: 'Marko Marić' })
    expect(links).toHaveLength(1)
    expect(screen.getByText('Zamjena · umjesto: Ivo Horvat')).toBeInTheDocument()
    // Chips, earliest first, each removable on its own.
    const chips = screen.getAllByRole('button', { name: /^Ukloni zamjenu / })
    expect(chips.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ukloni zamjenu 13.10.2026.',
      'Ukloni zamjenu 20.10.2026.',
    ])
    // The replaced predavač says which termini they hand over.
    const handover = screen.getByText(/^Mijenja se:/)
    expect(handover).toHaveTextContent('13.10.2026.')
    expect(handover).toHaveTextContent('20.10.2026.')
  })
})
