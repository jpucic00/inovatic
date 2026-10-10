import { describe, expect, it } from 'vitest'
import type { MaterialAudience, MaterialType } from '@prisma/client'
import {
  interactiveGuides,
  type GroupMaterialsView,
  type LessonView,
  type MaterialItem,
  type ModuleLessonsView,
} from '@/lib/group-materials-view'

let seq = 0
function item(
  title: string,
  type: MaterialType,
  sortOrder = 0,
  externalUrl: string | null = null,
  audience: MaterialAudience = 'STUDENT',
): MaterialItem {
  seq += 1
  return {
    id: `m${seq}`,
    title,
    description: null,
    type,
    audience,
    fileUrl: null,
    externalUrl,
    fileSize: null,
    mimeType: null,
    sortOrder,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function lesson(title: string, materials: MaterialItem[]): LessonView {
  seq += 1
  return {
    id: `l${seq}`,
    title,
    description: null,
    sessionNumbers: [],
    firstDate: null,
    isCurrent: false,
    materials,
  }
}

function section(
  moduleId: string | null,
  title: string | null,
  lessons: LessonView[],
  teacherMaterials: MaterialItem[] = [],
): ModuleLessonsView {
  return {
    moduleId,
    title,
    sortOrder: 1,
    isActive: false,
    currentLessonId: null,
    lessons,
    teacherMaterials,
  }
}

function view(partial: Partial<GroupMaterialsView>): GroupMaterialsView {
  return {
    viewer: 'STUDENT',
    group: {
      id: 'g1',
      name: null,
      dayOfWeek: null,
      startTime: null,
      endTime: null,
      course: { id: 'c1', title: 'SLR 2', kind: 'STANDARD' },
      location: { name: 'Velebitska 32' },
      teacherNames: [],
    },
    modules: [],
    programTeacherMaterials: [],
    activeModuleId: null,
    ...partial,
  }
}

describe('interactiveGuides', () => {
  it('labels a guide with its module and its lesson', () => {
    const guides = interactiveGuides(
      view({
        modules: [
          section('mod1', 'Prometni sustavi 2.0', [lesson('Semafor', [item('Semafor vodič', 'ROBOCAMP')])]),
        ],
      }),
    )
    expect(guides).toHaveLength(1)
    expect(guides[0].item.title).toBe('Semafor vodič')
    expect(guides[0].moduleTitle).toBe('Prometni sustavi 2.0')
    expect(guides[0].lessonTitle).toBe('Semafor')
  })

  it('collects guides from every lesson of a module, in lesson order', () => {
    const guides = interactiveGuides(
      view({
        modules: [
          section('mod1', 'Modul', [
            lesson('Prva', [item('A', 'ROBOCAMP'), item('Radni list', 'DOCUMENT')]),
            lesson('Druga', [item('B', 'ROBOCAMP')]),
          ]),
        ],
      }),
    )
    expect(guides.map((g) => [g.item.title, g.lessonTitle])).toEqual([
      ['A', 'Prva'],
      ['B', 'Druga'],
    ])
  })

  it('finds a radionica guide, whose section has no module title', () => {
    const guides = interactiveGuides(
      view({ modules: [section(null, null, [lesson('Uvod', [item('Vodič', 'ROBOCAMP')])])] }),
    )
    expect(guides).toHaveLength(1)
    expect(guides[0].moduleTitle).toBeNull()
    expect(guides[0].lessonTitle).toBe('Uvod')
  })

  it('returns every natjecanje guide for a competition group', () => {
    const guides = interactiveGuides(
      view({
        modules: [
          section('a', 'FLL', [lesson('FLL sat', [item('FLL vodič', 'ROBOCAMP')])]),
          section('b', 'WRO', [lesson('WRO sat', [item('WRO vodič', 'ROBOCAMP')])]),
        ],
      }),
    )
    expect(guides.map((g) => g.moduleTitle)).toEqual(['FLL', 'WRO'])
  })

  it('recognises an un-backfilled RoboCamp row by its URL', () => {
    const legacy = item('Stari redak', 'VIDEO', 0, 'https://elearning.robocamp.eu/course/1')
    const guides = interactiveGuides(view({ modules: [section('m', 'M', [lesson('L', [legacy])])] }))
    expect(guides.map((g) => g.item.title)).toEqual(['Stari redak'])
  })
})
