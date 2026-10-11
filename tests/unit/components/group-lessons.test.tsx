import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type {
  StaffGroupLessons,
  StaffLesson,
  StaffLessonModule,
} from '@/actions/teacher/materials'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import { GroupLessons } from '@/components/teacher/group-lessons/group-lessons'
import { resolveLessonFocus } from '@/components/teacher/group-lessons/lesson-focus'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
// The tree reaches two actions: the "Dodaj materijal" modal and the delete button.
vi.mock('@/actions/material/crud', () => ({
  createMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
}))

let seq = 0
function row(title: string, overrides: Partial<StaffMaterialRow> = {}): StaffMaterialRow {
  seq += 1
  return {
    id: `r${seq}`,
    title,
    description: null,
    type: 'LINK',
    scope: 'LESSON',
    audience: 'STUDENT',
    fileUrl: null,
    externalUrl: 'https://example.com',
    fileSize: null,
    mimeType: null,
    sortOrder: 0,
    hiddenInThisGroup: false,
    canEdit: false,
    ...overrides,
  }
}

function lesson(id: string, overrides: Partial<StaffLesson> = {}): StaffLesson {
  return {
    id,
    title: `Lekcija ${id}`,
    description: null,
    sessionNumbers: [],
    firstDate: null,
    isCurrent: false,
    isNext: false,
    teacherRows: [],
    studentRows: [],
    ...overrides,
  }
}

function mod(id: string | null, lessons: StaffLesson[], overrides: Partial<StaffLessonModule> = {}): StaffLessonModule {
  return { moduleId: id, title: id ? `Modul ${id}` : null, isActive: false, lessons, teacherRows: [], ...overrides }
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

/**
 * A standard year mid-way: module 1 is over (its last lesson is "current"
 * THERE), the group is on module 2's last lesson, and module 3 starts next —
 * which the server reports as module 3's own `isNext`.
 */
function standardYear(): StaffGroupLessons {
  return {
    groupId: 'g1',
    programTeacherRows: [],
    modules: [
      mod('1', [
        lesson('1a', { sessionNumbers: [1, 2], firstDate: d('2026-09-07') }),
        lesson('1b', { sessionNumbers: [3, 4, 5, 6, 7], firstDate: d('2026-09-21'), isCurrent: true }),
      ]),
      mod(
        '2',
        [
          lesson('2a', { sessionNumbers: [1, 2, 3], firstDate: d('2026-11-02') }),
          lesson('2b', {
            sessionNumbers: [4, 5, 6, 7],
            firstDate: d('2026-11-23'),
            isCurrent: true,
            studentRows: [row('Radni list', { scope: 'LESSON' })],
          }),
        ],
        { isActive: true },
      ),
      mod('3', [
        lesson('3a', { sessionNumbers: [1, 2], firstDate: d('2027-01-11'), isNext: true }),
        lesson('3b', { sessionNumbers: [3, 4], firstDate: d('2027-01-25') }),
      ]),
      mod('4', [lesson('4a', { sessionNumbers: [1], firstDate: d('2027-03-01'), isNext: true })]),
    ],
  }
}

describe('resolveLessonFocus', () => {
  it('takes current from the active module only and next as the earliest isNext anywhere', () => {
    const focus = resolveLessonFocus(standardYear().modules)

    expect(focus.currentLessonId).toBe('2b')
    // Module 3 starts before module 4 — the module-local isNext of 4 is not "next".
    expect(focus.nextLessonId).toBe('3a')
    // Only the current lesson (and its module) opens; "next" is a badge.
    expect([...focus.openModuleKeys]).toEqual(['2'])
    expect([...focus.openLessonIds]).toEqual(['2b'])
  })

  it('opens every natjecanje of an undated program, with no lesson marked', () => {
    const focus = resolveLessonFocus([
      mod('fll', [lesson('f1', { isCurrent: true }), lesson('f2')]),
      mod('wro', [lesson('w1', { isCurrent: true })]),
    ])

    expect(focus.currentLessonId).toBeNull()
    expect(focus.nextLessonId).toBeNull()
    expect([...focus.openModuleKeys].sort()).toEqual(['fll', 'wro'])
    expect(focus.openLessonIds.size).toBe(0)
  })

  it('opens a radionica first lesson without labelling it current', () => {
    const focus = resolveLessonFocus([mod(null, [lesson('x', { isCurrent: true }), lesson('y')])])

    expect(focus.currentLessonId).toBeNull()
    expect([...focus.openLessonIds]).toEqual(['x'])
    expect([...focus.openModuleKeys]).toEqual(['program'])
  })
})

const lessonButton = (title: string) => screen.getByRole('button', { name: new RegExp(title) })
const lessonHeading = (title: string) => screen.getByRole('heading', { name: new RegExp(title) })

describe('GroupLessons', () => {
  it('keeps the current lesson always open and apart; next is a closed lesson with a badge', () => {
    render(<GroupLessons data={standardYear()} editable />)

    // The current lesson is not a toggle at all: its heading is plain text.
    expect(lessonHeading('Lekcija 2b')).toHaveTextContent('Trenutna lekcija')
    expect(screen.queryByRole('button', { name: /Lekcija 2b/ })).toBeNull()
    expect(document.getElementById('lekcija-2b')).not.toHaveAttribute('hidden')
    // Sats only — a multi-sat lesson has no single date to show.
    expect(lessonHeading('Lekcija 2b')).toHaveTextContent('4.–7. sat')
    expect(lessonHeading('Lekcija 2b')).not.toHaveTextContent('23.11.')

    // Module 3 (next) stays folded until tapped; its first lesson carries "Sljedeća".
    expect(screen.getByRole('button', { name: /Modul 3/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /Modul 3/ }))
    expect(lessonButton('Lekcija 3a')).toHaveTextContent('Sljedeća lekcija')
    expect(lessonButton('Lekcija 3a')).toHaveAttribute('aria-expanded', 'false')

    expect(screen.getByRole('button', { name: /Modul 1/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByText('Trenutna lekcija')).toHaveLength(1)
    expect(screen.getByText('Aktivni modul')).toBeInTheDocument()
    expect(lessonButton('Lekcija 2a')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens any other lesson and module on tap, tree-style', () => {
    render(<GroupLessons data={standardYear()} editable />)

    fireEvent.click(screen.getByRole('button', { name: /Modul 1/ }))
    fireEvent.click(lessonButton('Lekcija 1b'))

    expect(lessonButton('Lekcija 1b')).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('lekcija-1b')).not.toHaveAttribute('hidden')
  })

  it('is a reading view: cards, hidden rows left out, no edit mode and no row controls', () => {
    const data = standardYear()
    data.modules[1].lessons[1].studentRows = [
      row('Kurikulum list', { scope: 'LESSON' }),
      row('Naša poveznica', { scope: 'GROUP', canEdit: true }),
      row('Skriveni list', { scope: 'LESSON', hiddenInThisGroup: true }),
    ]
    render(<GroupLessons data={data} editable />)

    const panel = document.getElementById('lekcija-2b') as HTMLElement
    expect(within(panel).getByText('Kurikulum list')).toBeInTheDocument()
    expect(within(panel).getByText('Naša poveznica')).toBeInTheDocument()
    expect(within(panel).queryByText('Skriveni list')).toBeNull()

    expect(screen.queryByRole('button', { name: /Uredi materijale/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Odaberi datoteke/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sakrij u ovoj grupi/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Premjesti/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Uredi materijal$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Dodaj materijal' })).toBeInTheDocument()
  })

  it('puts a delete button only beside a material this group added and the viewer may delete', () => {
    const data = standardYear()
    data.modules[1].lessons[1].studentRows = [
      row('Kurikulum list', { scope: 'LESSON', canEdit: false }),
      row('Moja poveznica', { scope: 'GROUP', canEdit: true }),
      row('Kolegina poveznica', { scope: 'GROUP', canEdit: false }),
    ]
    data.modules[1].lessons[1].teacherRows = [
      row('Moj vodič', {
        scope: 'GROUP',
        audience: 'TEACHER',
        type: 'LINK',
        canEdit: true,
      }),
    ]
    render(<GroupLessons data={data} editable />)

    const panel = document.getElementById('lekcija-2b') as HTMLElement
    const deletes = within(panel).getAllByRole('button', { name: 'Obriši materijal' })
    expect(deletes).toHaveLength(2)
    const besideTitle = (title: string) =>
      (within(panel).getByText(title).closest('div.flex') as HTMLElement | null)?.querySelector(
        'button[aria-label="Obriši materijal"]',
      ) ?? null
    expect(besideTitle('Moja poveznica')).not.toBeNull()
    expect(besideTitle('Moj vodič')).not.toBeNull()
    expect(besideTitle('Kurikulum list')).toBeNull()
    expect(besideTitle('Kolegina poveznica')).toBeNull()
  })

  it('offers no delete to a substitute or on an archived year, even on the group\'s own rows', () => {
    const data = standardYear()
    data.modules[1].lessons[1].studentRows = [row('Moja poveznica', { scope: 'GROUP', canEdit: true })]
    render(<GroupLessons data={data} editable={false} />)

    expect(screen.queryByRole('button', { name: 'Obriši materijal' })).toBeNull()
  })

  it('adds through one modal: title first, optional description, then lesson and audience', () => {
    render(<GroupLessons data={standardYear()} editable />)

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
    const dialog = screen.getByRole('dialog')
    const fields = within(dialog)
      .getAllByRole('textbox')
      .map((el) => el.id)
    expect(fields.slice(0, 2)).toEqual(['group-material-title', 'group-material-description'])

    // The lesson being taught is preselected; no audience is.
    expect(within(dialog).getByLabelText('Lekcija')).toHaveValue('2b')
    expect(within(dialog).getByRole('radio', { name: /Za nastavnike/ })).not.toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /Za polaznike/ })).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Spremi' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('radio', { name: /Za nastavnike/ }))
    expect(within(dialog).queryByRole('radio', { name: 'RoboCamp' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Za polaznike/ }))
    expect(within(dialog).getByRole('radio', { name: 'RoboCamp' })).toBeInTheDocument()
  })

  it('offers no adding on an archived year or to a substitute', () => {
    render(<GroupLessons data={standardYear()} editable={false} />)

    expect(screen.queryByRole('button', { name: 'Dodaj materijal' })).toBeNull()
    expect(document.getElementById('lekcija-2b')).not.toHaveAttribute('hidden')
  })

  it('shows whole-program and whole-module teacher rows as cards', () => {
    const data = standardYear()
    data.programTeacherRows = [row('Godišnji plan', { scope: 'COURSE', audience: 'TEACHER' })]
    data.modules[1].teacherRows = [row('Upute za modul', { scope: 'MODULE', audience: 'TEACHER' })]
    render(<GroupLessons data={data} editable />)

    expect(screen.getByRole('heading', { name: 'Za nastavnike — cijeli program' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Za nastavnike — cijeli modul' })).toBeInTheDocument()
    expect(screen.getByText('Godišnji plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sakrij u ovoj grupi' })).toBeNull()
  })

  it('renders a radionica as one list with no module header; its first lesson opens but is not "current"', () => {
    render(
      <GroupLessons
        data={{ groupId: 'g1', programTeacherRows: [], modules: [mod(null, [lesson('x', { isCurrent: true })])] }}
        editable
      />,
    )

    expect(lessonButton('Lekcija x')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Trenutna lekcija')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })
})
