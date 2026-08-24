import { describe, expect, it } from 'vitest'
import type { MaterialType } from '@prisma/client'
import {
  flattenExtraMaterials,
  interactiveGuides,
  type GroupMaterialsView,
} from '@/lib/group-materials-view'

let seq = 0
function item(title: string, type: MaterialType, sortOrder = 0, externalUrl: string | null = null) {
  seq += 1
  return {
    id: `m${seq}`,
    title,
    description: null,
    type,
    fileUrl: null,
    externalUrl,
    fileSize: null,
    mimeType: null,
    sortOrder,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

const empty = () => ({ robocamp: [], videos: [], docs: [], links: [] })

function view(partial: Partial<GroupMaterialsView>): GroupMaterialsView {
  return {
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
    moduleSections: [],
    programMaterials: empty(),
    groupMaterials: empty(),
    radionicaMaterials: empty(),
    activeModuleId: null,
    ...partial,
  }
}

describe('interactiveGuides', () => {
  it('labels a module-scoped guide with its module', () => {
    const guide = item('Semafor', 'ROBOCAMP')
    const guides = interactiveGuides(
      view({
        moduleSections: [
          { moduleId: 'mod1', title: 'Prometni sustavi 2.0', sortOrder: 1, isActive: true, buckets: { ...empty(), robocamp: [guide] } },
        ],
      }),
    )
    expect(guides).toHaveLength(1)
    expect(guides[0].moduleTitle).toBe('Prometni sustavi 2.0')
  })

  it('keeps programme- and group-scoped guides, which the old featured set dropped', () => {
    const guides = interactiveGuides(
      view({
        programMaterials: { ...empty(), robocamp: [item('Za cijeli program', 'ROBOCAMP')] },
        groupMaterials: { ...empty(), robocamp: [item('Samo ova grupa', 'ROBOCAMP')] },
      }),
    )
    expect(guides.map((g) => g.item.title)).toEqual(['Za cijeli program', 'Samo ova grupa'])
    // Nothing outside a module can name one, and inventing a label would lie.
    expect(guides.every((g) => g.moduleTitle === null)).toBe(true)
  })

  it('finds a radionica guide, which has no module to belong to', () => {
    const guides = interactiveGuides(
      view({ radionicaMaterials: { ...empty(), robocamp: [item('Vodič', 'ROBOCAMP')] } }),
    )
    expect(guides).toHaveLength(1)
    expect(guides[0].moduleTitle).toBeNull()
  })

  it('returns every natjecanje guide for a competition group', () => {
    const guides = interactiveGuides(
      view({
        moduleSections: [
          { moduleId: 'a', title: 'FLL', sortOrder: 1, isActive: false, buckets: { ...empty(), robocamp: [item('FLL vodič', 'ROBOCAMP')] } },
          { moduleId: 'b', title: 'WRO', sortOrder: 2, isActive: false, buckets: { ...empty(), robocamp: [item('WRO vodič', 'ROBOCAMP')] } },
        ],
      }),
    )
    expect(guides.map((g) => g.moduleTitle)).toEqual(['FLL', 'WRO'])
  })
})

describe('flattenExtraMaterials', () => {
  it('merges every scope into one list and never repeats a guide', () => {
    const extras = flattenExtraMaterials(
      view({
        moduleSections: [
          {
            moduleId: 'mod1',
            title: 'Modul',
            sortOrder: 1,
            isActive: true,
            buckets: { robocamp: [item('Vodič', 'ROBOCAMP')], videos: [item('Snimka', 'VIDEO')], docs: [], links: [] },
          },
        ],
        programMaterials: { ...empty(), docs: [item('Popis dijelova', 'DOCUMENT')] },
        groupMaterials: { ...empty(), links: [item('Scratch', 'LINK')] },
      }),
    )
    expect(extras.map((m) => m.title)).toEqual(['Snimka', 'Popis dijelova', 'Scratch'])
  })

  it('orders by kind first — video, prezentacija, dokument, poveznica', () => {
    const extras = flattenExtraMaterials(
      view({
        programMaterials: {
          ...empty(),
          links: [item('L', 'LINK')],
          docs: [item('D', 'DOCUMENT'), item('P', 'PRESENTATION')],
          videos: [item('V', 'VIDEO')],
        },
      }),
    )
    expect(extras.map((m) => m.title)).toEqual(['V', 'P', 'D', 'L'])
  })

  it('falls back to sortOrder inside one kind', () => {
    const extras = flattenExtraMaterials(
      view({
        programMaterials: { ...empty(), docs: [item('drugi', 'DOCUMENT', 2), item('prvi', 'DOCUMENT', 1)] },
      }),
    )
    expect(extras.map((m) => m.title)).toEqual(['prvi', 'drugi'])
  })

  it('leaves guides out entirely — they render in their own section', () => {
    // Mirrors how partitionMaterials buckets: an un-backfilled row whose URL is
    // RoboCamp lands in `robocamp`, not `videos`, so it must reach the guide
    // section and never appear a second time among the extras.
    const legacy = item('Stari redak', 'VIDEO', 0, 'https://elearning.robocamp.eu/course/1')
    const v = view({ programMaterials: { ...empty(), robocamp: [legacy] } })

    expect(interactiveGuides(v).map((g) => g.item.title)).toEqual(['Stari redak'])
    expect(flattenExtraMaterials(v)).toEqual([])
  })
})
