import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MaterialType } from '@prisma/client'
import { LessonAccordion } from '@/components/portal/lesson-accordion'
import { MaterialList } from '@/components/portal/material-list'
import {
  toCurrentLessonOnly,
  type GroupMaterialsView,
  type LessonView,
  type MaterialItem,
  type ModuleLessonsView,
} from '@/lib/group-materials-view'

vi.mock('@/components/material/robocamp-embed', () => ({
  RobocampEmbed: ({ title }: { title?: string }) => <div data-testid="embed">{title}</div>,
}))
vi.mock('@/components/material/video-embed', () => ({
  VideoEmbed: ({ title }: { title?: string }) => <div data-testid="video-embed">{title}</div>,
}))

let seq = 0
function material(title: string, type: MaterialType, externalUrl: string | null = null): MaterialItem {
  seq += 1
  return {
    id: `m${seq}`,
    title,
    description: null,
    type,
    audience: 'STUDENT',
    fileUrl: type === 'DOCUMENT' ? 'https://cdn/x.pdf' : null,
    externalUrl,
    fileSize: null,
    mimeType: null,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function lesson(id: string, overrides: Partial<LessonView> = {}): LessonView {
  return {
    id,
    title: `Lekcija ${id}`,
    description: null,
    sessionNumbers: [],
    firstDate: null,
    isCurrent: false,
    materials: [],
    ...overrides,
  }
}

const header = (title: string) => screen.getByRole('button', { name: new RegExp(title) })
const isOpen = (title: string) => header(title).getAttribute('aria-expanded') === 'true'

// A dated standard module: sat 1–2, 3–4, 5–7, and the group is on the second.
const DATED = (): LessonView[] => [
  lesson('A', {
    sessionNumbers: [1, 2],
    firstDate: new Date('2026-10-05T00:00:00Z'),
    materials: [material('Radni list A', 'DOCUMENT')],
  }),
  lesson('B', {
    sessionNumbers: [3, 4],
    firstDate: new Date('2026-10-19T00:00:00Z'),
    isCurrent: true,
    materials: [
      material('Vodič B', 'ROBOCAMP', 'https://elearning.robocamp.eu/course/1'),
      material('Radni list B', 'DOCUMENT'),
    ],
  }),
  lesson('C', {
    sessionNumbers: [5, 6, 7],
    firstDate: new Date('2026-11-02T00:00:00Z'),
    materials: [material('Radni list C', 'DOCUMENT')],
  }),
]

describe('LessonAccordion — dated module', () => {
  it('opens the current lesson by default and keeps the others collapsed', () => {
    render(<LessonAccordion lessons={DATED()} currentLessonId="B" />)

    expect([isOpen('Lekcija A'), isOpen('Lekcija B'), isOpen('Lekcija C')]).toEqual([
      false,
      true,
      false,
    ])
    expect(screen.getByText('Vodič B')).toBeTruthy()
    expect(screen.getByText('Radni list B')).toBeTruthy()
    // Collapsed lessons mount nothing.
    expect(screen.queryByText('Radni list A')).toBeNull()
    expect(screen.queryByText('Radni list C')).toBeNull()
  })

  it('labels each lesson with its sats but no date, and badges only the current one', () => {
    render(<LessonAccordion lessons={DATED()} currentLessonId="B" />)

    expect(header('Lekcija A').textContent).toContain('1.–2. sat')
    expect(header('Lekcija A').textContent).not.toContain('05.10.')
    expect(header('Lekcija C').textContent).toContain('5.–7. sat')
    expect(header('Lekcija C').textContent).not.toContain('02.11.')
    expect(screen.getAllByText('Trenutna lekcija')).toHaveLength(1)
    expect(header('Lekcija B').textContent).toContain('Trenutna lekcija')
  })

  it('opens any other lesson on click, and closes it again', () => {
    render(<LessonAccordion lessons={DATED()} currentLessonId="B" />)

    fireEvent.click(header('Lekcija C'))
    expect(isOpen('Lekcija C')).toBe(true)
    expect(isOpen('Lekcija B')).toBe(true)
    expect(screen.getByText('Radni list C')).toBeTruthy()

    fireEvent.click(header('Lekcija C'))
    expect(isOpen('Lekcija C')).toBe(false)
    expect(screen.queryByText('Radni list C')).toBeNull()
  })

  it('ties each header to its panel for assistive tech', () => {
    render(<LessonAccordion lessons={DATED()} currentLessonId="B" />)

    const controls = header('Lekcija A').getAttribute('aria-controls')
    const panel = controls ? document.getElementById(controls) : null
    expect(panel).not.toBeNull()
    expect(panel?.hidden).toBe(true)
  })

  it('opens nothing before the first lesson starts and says when it does', () => {
    const lessons = DATED().map((l) => ({ ...l, isCurrent: false }))
    render(<LessonAccordion lessons={lessons} currentLessonId={null} />)

    expect([isOpen('Lekcija A'), isOpen('Lekcija B'), isOpen('Lekcija C')]).toEqual([
      false,
      false,
      false,
    ])
    expect(screen.getByText('Prva lekcija počinje 05.10.')).toBeTruthy()
    expect(screen.queryByText('Trenutna lekcija')).toBeNull()
  })
})

describe('LessonAccordion — undated lessons (radionica, natjecanje)', () => {
  const UNDATED = () => [
    lesson('A', { isCurrent: true, materials: [material('Upute', 'DOCUMENT')] }),
    lesson('B', { materials: [material('Snimka', 'VIDEO', 'https://youtu.be/x')] }),
  ]

  it('opens the first lesson without claiming it is "current" on any calendar', () => {
    render(<LessonAccordion lessons={UNDATED()} currentLessonId="A" />)

    expect(isOpen('Lekcija A')).toBe(true)
    expect(isOpen('Lekcija B')).toBe(false)
    expect(screen.getByText('Upute')).toBeTruthy()
    expect(screen.queryByText('Trenutna lekcija')).toBeNull()
    // No sat label, no date.
    expect(header('Lekcija A').textContent).not.toMatch(/sat|\d{2}\.\d{2}\./)
    expect(screen.queryByText(/Prva lekcija počinje/)).toBeNull()
  })
})

describe('LessonAccordion — empty lesson', () => {
  it('says briefly that a lesson has no materials yet', () => {
    render(<LessonAccordion lessons={[lesson('A', { isCurrent: true })]} currentLessonId="A" />)

    expect(screen.getByText('Za ovu lekciju još nema materijala.')).toBeTruthy()
  })
})

function section(overrides: Partial<ModuleLessonsView>): ModuleLessonsView {
  return {
    moduleId: 'mod',
    title: 'Modul 2: Senzori',
    sortOrder: 1,
    isActive: false,
    currentLessonId: null,
    dated: false,
    firstLessonStart: null,
    lessons: [],
    teacherMaterials: [],
    ...overrides,
  }
}

function view(modules: ModuleLessonsView[]): GroupMaterialsView {
  return {
    viewer: 'STUDENT',
    currentLessonOnly: false,
    group: {
      id: 'g',
      name: null,
      dayOfWeek: 'MON',
      startTime: '17:00',
      endTime: '18:30',
      course: { id: 'c', title: 'SLR 2', kind: 'STANDARD' },
      location: { name: 'Velebitska' },
      teacherNames: [],
    },
    modules,
    programTeacherMaterials: [],
    activeModuleId: null,
  }
}

describe('MaterialList', () => {
  it('keeps the "not published yet" state when the module has no lessons', () => {
    render(<MaterialList view={view([section({ isActive: true })])} />)

    expect(screen.getByText('Materijali još nisu objavljeni')).toBeTruthy()
  })

  it('heads a standard module as the current one', () => {
    render(
      <MaterialList
        view={view([section({ isActive: true, currentLessonId: 'A', lessons: [lesson('A', { isCurrent: true })] })])}
      />,
    )

    expect(screen.getByText('Trenutni modul')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Modul 2: Senzori' })).toBeTruthy()
  })

  it('lists every prepared natjecanje and drops the empty ones', () => {
    render(
      <MaterialList
        view={view([
          section({ moduleId: 'fll', title: 'FLL', currentLessonId: 'F', lessons: [lesson('F', { isCurrent: true })] }),
          section({ moduleId: 'wro', title: 'WRO', currentLessonId: 'W', lessons: [lesson('W', { isCurrent: true })] }),
          section({ moduleId: 'prip', title: 'Pripreme' }),
        ])}
      />,
    )

    expect(screen.getByRole('heading', { name: 'FLL' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'WRO' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Pripreme' })).toBeNull()
    expect(screen.queryByText('Trenutni modul')).toBeNull()
    // Each natjecanje opens its own first lesson.
    expect(isOpen('Lekcija F')).toBe(true)
    expect(isOpen('Lekcija W')).toBe(true)
  })

  it('renders a radionica without a module heading', () => {
    render(
      <MaterialList
        view={view([
          section({ moduleId: null, title: null, currentLessonId: 'R', lessons: [lesson('R', { isCurrent: true })] }),
        ])}
      />,
    )

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(isOpen('Lekcija R')).toBe(true)
  })
})

describe('toCurrentLessonOnly (parent view)', () => {
  it('keeps only the current lesson of a dated section and leaves undated ones whole', () => {
    const cut = toCurrentLessonOnly(
      view([
        section({ moduleId: 'm2', dated: true, currentLessonId: 'B', lessons: DATED() }),
        section({ moduleId: null, title: null, currentLessonId: 'R', lessons: [lesson('R'), lesson('S')] }),
      ]),
    )
    expect(cut.currentLessonOnly).toBe(true)
    expect(cut.modules[0].lessons.map((l) => l.id)).toEqual(['B'])
    expect(cut.modules[1].lessons.map((l) => l.id)).toEqual(['R', 'S'])
  })

  it('keeps nothing of a dated section before its first lesson starts', () => {
    const cut = toCurrentLessonOnly(view([section({ dated: true, currentLessonId: null, lessons: DATED() })]))
    expect(cut.modules[0].lessons).toEqual([])
  })
})

describe('MaterialList — parent view', () => {
  it('shows the current lesson as one open card with its materials, and no other lesson', () => {
    render(
      <MaterialList
        view={toCurrentLessonOnly(
          view([section({ isActive: true, dated: true, currentLessonId: 'B', lessons: DATED() })]),
        )}
      />,
    )

    expect(screen.getByText('Trenutni modul')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Lekcija B' })).toBeTruthy()
    expect(screen.getByText('Trenutna lekcija')).toBeTruthy()
    expect(screen.getByText('Radni list B')).toBeTruthy()
    expect(screen.queryByText(/Lekcija A|Lekcija C|Radni list A|Radni list C/)).toBeNull()
    // A card, not an accordion: nothing to toggle.
    expect(screen.queryByRole('button', { name: /Lekcija B/ })).toBeNull()
  })

  it('says when the first lesson starts instead of the "not published" state', () => {
    render(
      <MaterialList
        view={toCurrentLessonOnly(
          view([
            section({
              isActive: true,
              dated: true,
              currentLessonId: null,
              firstLessonStart: new Date('2026-10-05T00:00:00Z'),
              lessons: DATED(),
            }),
          ]),
        )}
      />,
    )

    expect(screen.getByText('Prva lekcija počinje 05.10.')).toBeTruthy()
    expect(screen.queryByText('Materijali još nisu objavljeni')).toBeNull()
    expect(screen.queryByText('Radni list A')).toBeNull()
  })

  it('keeps the accordion of every lesson for an undated section', () => {
    render(
      <MaterialList
        view={toCurrentLessonOnly(
          view([section({ moduleId: null, title: null, currentLessonId: 'R', lessons: [lesson('R'), lesson('S')] })]),
        )}
      />,
    )

    expect(isOpen('Lekcija R')).toBe(true)
    expect(header('Lekcija S')).toBeTruthy()
  })
})
