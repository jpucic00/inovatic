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
vi.mock('@/actions/material/crud', () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
  setMaterialHidden: vi.fn(),
}))
vi.mock('@/actions/material/move', () => ({
  setMaterialsAudience: vi.fn(),
  moveMaterialToLesson: vi.fn(),
}))
vi.mock('@/actions/admin/material-city', () => ({
  setMaterialCityOnly: vi.fn(),
  makeMaterialShared: vi.fn(),
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
    expect([...focus.openModuleKeys].sort()).toEqual(['2', '3'])
    expect([...focus.openLessonIds].sort()).toEqual(['2b', '3a'])
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

describe('GroupLessons', () => {
  it('marks the current and next lesson and opens only their modules', () => {
    render(<GroupLessons data={standardYear()} editable />)

    expect(lessonButton('Lekcija 2b')).toHaveTextContent('Trenutna lekcija')
    expect(lessonButton('Lekcija 2b')).toHaveTextContent('4.–7. sat · 23.11.')
    expect(lessonButton('Lekcija 3a')).toHaveTextContent('Sljedeća')
    // Module 1's own "current" lesson is history, not the class being taught.
    expect(screen.getByRole('button', { name: /Modul 1/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Lekcija 1b/ })).toBeNull()
    expect(screen.getAllByText('Trenutna lekcija')).toHaveLength(1)
    expect(screen.getByText('Aktivni modul')).toBeInTheDocument()

    expect(lessonButton('Lekcija 2b')).toHaveAttribute('aria-expanded', 'true')
    expect(lessonButton('Lekcija 2a')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a folded module on tap', () => {
    render(<GroupLessons data={standardYear()} editable />)

    fireEvent.click(screen.getByRole('button', { name: /Modul 1/ }))

    expect(lessonButton('Lekcija 1b')).toBeInTheDocument()
  })

  it('offers adding into both audiences, RoboCamp only for the polaznici', () => {
    render(<GroupLessons data={standardYear()} editable />)
    const panel = document.getElementById('lekcija-2b') as HTMLElement

    const teacher = within(panel).getByRole('heading', { name: 'Za nastavnike' }).closest('section') as HTMLElement
    const student = within(panel).getByRole('heading', { name: 'Za polaznike' }).closest('section') as HTMLElement
    expect(within(teacher).getByRole('button', { name: /Odaberi datoteke/ })).toBeInTheDocument()
    expect(within(teacher).queryByRole('button', { name: /RoboCamp/i })).toBeNull()
    expect(within(student).getByRole('button', { name: /RoboCamp/i })).toBeInTheDocument()
  })

  it('lets a curriculum row only be hidden, and the group row be moved after a confirm naming this group', () => {
    const data = standardYear()
    const current = data.modules[1].lessons[1]
    current.studentRows = [
      row('Kurikulum list', { scope: 'LESSON', canEdit: false }),
      row('Naša poveznica', { scope: 'GROUP', canEdit: true, groupName: 'Pon' }),
    ]
    current.teacherRows = [row('Skrivena priprema', { scope: 'LESSON', audience: 'TEACHER', hiddenInThisGroup: true })]
    render(<GroupLessons data={data} editable />)

    const curriculum = screen.getByRole('link', { name: 'Kurikulum list' }).closest('li') as HTMLElement
    expect(within(curriculum).getByRole('button', { name: 'Sakrij u ovoj grupi' })).toBeInTheDocument()
    expect(within(curriculum).queryByRole('button', { name: /Premjesti/ })).toBeNull()

    const hidden = screen.getByRole('link', { name: 'Skrivena priprema' }).closest('li') as HTMLElement
    expect(within(hidden).getByText('Sakriveno u grupi')).toBeInTheDocument()
    expect(within(hidden).getByRole('button', { name: 'Prikaži u ovoj grupi' })).toBeInTheDocument()

    // Our own row sits in the polaznici section and can go back to the nastavnici
    // without asking; a teacher-side row going the other way asks first.
    const own = screen.getByRole('link', { name: 'Naša poveznica' }).closest('li') as HTMLElement
    expect(within(own).getByRole('button', { name: 'Premjesti u nastavnike' })).toBeInTheDocument()
  })

  it('asks before moving a group row into the polaznici, naming only this group', () => {
    const data = standardYear()
    data.modules[1].lessons[1].teacherRows = [
      row('Moja priprema', { scope: 'GROUP', audience: 'TEACHER', canEdit: true }),
    ]
    render(<GroupLessons data={data} editable />)

    fireEvent.click(screen.getByRole('button', { name: 'Premjesti u polaznike' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('„Moja priprema" će vidjeti roditelji i djeca u ovoj grupi.')
    expect(dialog).not.toHaveTextContent('oba grada')
  })

  it('is read-only on an archived year', () => {
    const data = standardYear()
    data.modules[1].lessons[1].studentRows = [
      row('Kurikulum list', { scope: 'LESSON' }),
      row('Naša poveznica', { scope: 'GROUP', canEdit: true }),
    ]
    render(<GroupLessons data={data} editable={false} />)

    expect(screen.queryByRole('button', { name: /Odaberi datoteke/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sakrij u ovoj grupi/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Premjesti/ })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows whole-program and whole-module teacher rows, hide-only', () => {
    const data = standardYear()
    data.programTeacherRows = [row('Godišnji plan', { scope: 'COURSE', audience: 'TEACHER' })]
    data.modules[1].teacherRows = [row('Upute za modul', { scope: 'MODULE', audience: 'TEACHER' })]
    render(<GroupLessons data={data} editable />)

    expect(screen.getByRole('heading', { name: 'Za nastavnike — cijeli program' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Za nastavnike — cijeli modul' })).toBeInTheDocument()
    const planRow = screen.getByRole('link', { name: 'Godišnji plan' }).closest('li') as HTMLElement
    expect(within(planRow).getByRole('button', { name: 'Sakrij u ovoj grupi' })).toBeInTheDocument()
    expect(within(planRow).queryByRole('button', { name: /Premjesti/ })).toBeNull()
  })

  it('renders a radionica as one list with no module header', () => {
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
