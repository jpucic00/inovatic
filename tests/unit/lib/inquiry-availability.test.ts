import type { ProgramKind } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import {
  defaultGradesForLevel,
  effectiveGrades,
  hasOpenTermin,
  isTerminRequired,
  programsForSelection,
  uncoveredGrades,
} from '@/lib/inquiry-availability'
import { ELEMENTARY_GRADE_VALUES } from '@/lib/inquiry-status'

function group(isFull = false): ActiveGroup {
  return {
    id: `grp-${isFull ? 'full' : 'open'}`,
    name: 'Grupa',
    dayOfWeek: 'Ponedjeljak',
    dateStart: null,
    dateEnd: null,
    startTime: '17:00',
    endTime: '18:30',
    availableSpots: isFull ? 0 : 4,
    trialDate: null,
    isFull,
  }
}

function program(
  id: string,
  opts: Readonly<{ kind?: ProgramKind; level?: string | null; groups?: ActiveGroup[] }> = {},
): ActiveProgram {
  return {
    id,
    slug: id,
    title: `Program ${id}`,
    level: opts.level ?? 'SLR_1',
    kind: opts.kind ?? 'STANDARD',
    ageMin: 6,
    ageMax: 14,
    price: 50,
    groups: opts.groups ?? [group()],
  }
}

const uvodOpen = program('uvod', { level: 'UVOD', groups: [group()] })
const slr1Open = program('slr1', { level: 'SLR_1', groups: [group()] })
const slr1Full = program('slr1-full', { level: 'SLR_1', groups: [group(true)] })
const slr2Open = program('slr2', { level: 'SLR_2', groups: [group()] })
const radionicaOpen = program('rad', { kind: 'RADIONICA' as const, level: null, groups: [group()] })
const radionicaFull = program('rad-full', { kind: 'RADIONICA' as const, level: null, groups: [group(true)] })

describe('programsForSelection', () => {
  it('narrows the standard flow to the selected grade\'s level and drops radionice', () => {
    const result = programsForSelection([slr1Open, slr2Open, radionicaOpen], '1')
    expect(result.map((p) => p.id)).toEqual(['slr1'])
  })

  it('returns every standard program when no grade is chosen yet', () => {
    const result = programsForSelection([uvodOpen, slr1Open, slr2Open, radionicaOpen], '')
    expect(result.map((p) => p.id)).toEqual(['uvod', 'slr1', 'slr2'])
  })

  it('sends predškolci to the intro program, not to SLR 1', () => {
    const programs = [uvodOpen, slr1Open, slr2Open]
    expect(programsForSelection(programs, 'predskolci').map((p) => p.id)).toEqual(['uvod'])
    // …and 1. razred stays on SLR 1 rather than following them down.
    expect(programsForSelection(programs, '1').map((p) => p.id)).toEqual(['slr1'])
  })

  it('returns only the preselected course regardless of grade', () => {
    const result = programsForSelection([radionicaOpen, slr1Open], '5', 'rad')
    expect(result.map((p) => p.id)).toEqual(['rad'])
  })
})

// The Šibenik case: its first year runs SLR 1–3 only, so 7. and 8. razred are
// pointed at SLR 3 there while Split keeps the default ladder.
describe('programsForSelection — saved razred rules', () => {
  const slr3Open = program('slr3', { level: 'SLR_3', groups: [group()] })
  const slr4Open = program('slr4', { level: 'SLR_4', groups: [group()] })
  const all = [uvodOpen, slr1Open, slr2Open, slr3Open, slr4Open]

  it('offers the program its rule claims instead of the default level', () => {
    const rules = { slr3: ['5', '6', '7', '8'] } as const
    expect(programsForSelection(all, '8', undefined, rules).map((p) => p.id)).toEqual([
      'slr3',
      // SLR 4 has no rule, so it keeps its default claim on 8. razred.
      'slr4',
    ])
  })

  it('lists every program that claims the razred, each on its own', () => {
    const rules = { slr3: ['7', '8'], slr4: ['7', '8'] } as const
    expect(programsForSelection(all, '7', undefined, rules).map((p) => p.id)).toEqual([
      'slr3',
      'slr4',
    ])
  })

  it('treats an empty rule as "offered to nobody", not as unset', () => {
    const rules = { slr4: [] } as const
    expect(programsForSelection(all, '8', undefined, rules)).toEqual([])
    // …and the same program is still absent for every other razred.
    expect(programsForSelection(all, '7', undefined, rules)).toEqual([])
  })

  it('leaves programs without a rule on the default ladder', () => {
    const rules = { slr4: ['7', '8'] } as const
    expect(programsForSelection(all, '1', undefined, rules).map((p) => p.id)).toEqual(['slr1'])
  })

  it('still drops radionice, whatever a stray rule claims', () => {
    const rules = { rad: ['8'] } as const
    expect(programsForSelection([radionicaOpen, slr4Open], '8', undefined, rules).map((p) => p.id))
      .toEqual(['slr4'])
  })

  it('makes a termin required once a rule points the razred at an open group', () => {
    // Šibenik: no SLR 4 groups at all, so by default 8. razred has nothing.
    expect(isTerminRequired([slr3Open], '8')).toBe(false)
    expect(isTerminRequired([slr3Open], '8', undefined, { slr3: ['5', '6', '7', '8'] })).toBe(true)
  })
})

describe('defaultGradesForLevel', () => {
  it('is the exact inverse of the built-in ladder', () => {
    expect(defaultGradesForLevel('UVOD')).toEqual(['predskolci'])
    expect(defaultGradesForLevel('SLR_1')).toEqual(['1', '2'])
    expect(defaultGradesForLevel('SLR_2')).toEqual(['3', '4'])
    expect(defaultGradesForLevel('SLR_3')).toEqual(['5', '6'])
    expect(defaultGradesForLevel('SLR_4')).toEqual(['7', '8'])
  })

  it('covers every osnovna škola razred exactly once across the ladder', () => {
    const covered = ['UVOD', 'SLR_1', 'SLR_2', 'SLR_3', 'SLR_4'].flatMap(defaultGradesForLevel)
    expect([...covered].sort()).toEqual([...ELEMENTARY_GRADE_VALUES].sort())
  })

  it('gives nothing to a level-less program (radionica, natjecateljski)', () => {
    expect(defaultGradesForLevel(null)).toEqual([])
  })
})

describe('effectiveGrades', () => {
  it('falls back to the default when no rule is saved', () => {
    expect(effectiveGrades('SLR_3', null)).toEqual(['5', '6'])
    expect(effectiveGrades('SLR_3', undefined)).toEqual(['5', '6'])
  })

  it('returns the saved rule in razred order, empty list included', () => {
    expect(effectiveGrades('SLR_3', ['8', '5', '7', '6'])).toEqual(['5', '6', '7', '8'])
    expect(effectiveGrades('SLR_4', [])).toEqual([])
  })

  it('drops stored values that are no longer razredi', () => {
    expect(effectiveGrades('SLR_4', ['7', 'workshop', 'ss1'])).toEqual(['7'])
  })
})

describe('uncoveredGrades', () => {
  it('is empty when the default ladder is untouched', () => {
    const ladder = ['UVOD', 'SLR_1', 'SLR_2', 'SLR_3', 'SLR_4'].map(defaultGradesForLevel)
    expect(uncoveredGrades(ladder)).toEqual([])
  })

  it('names the razredi stranded by retiring a program', () => {
    // Šibenik mid-configuration: SLR 4 emptied but SLR 3 not yet widened.
    expect(
      uncoveredGrades([
        defaultGradesForLevel('UVOD'),
        defaultGradesForLevel('SLR_1'),
        defaultGradesForLevel('SLR_2'),
        defaultGradesForLevel('SLR_3'),
        [],
      ]),
    ).toEqual(['7', '8'])
  })
})

describe('hasOpenTermin', () => {
  it('is true only when some group still has a free spot', () => {
    expect(hasOpenTermin([slr1Open])).toBe(true)
    expect(hasOpenTermin([slr1Full])).toBe(false)
    expect(hasOpenTermin([slr1Full, slr1Open])).toBe(true)
    expect(hasOpenTermin([])).toBe(false)
  })
})

describe('isTerminRequired', () => {
  it('is false until a grade (or preselected course) is chosen', () => {
    expect(isTerminRequired([slr1Open], '')).toBe(false)
    expect(isTerminRequired([slr1Open], undefined)).toBe(false)
  })

  it('is true when the chosen grade maps to a program with an open group', () => {
    expect(isTerminRequired([slr1Open], '1')).toBe(true)
    expect(isTerminRequired([uvodOpen], 'predskolci')).toBe(true)
  })

  it('is false for predškolci when only SLR 1 is open', () => {
    expect(isTerminRequired([slr1Open], 'predskolci')).toBe(false)
  })

  it('is false when every group for the grade is full', () => {
    expect(isTerminRequired([slr1Full], '1')).toBe(false)
  })

  it('is false when the grade\'s level has no open program', () => {
    // Grade 3 → SLR_2; only an SLR_1 program is open.
    expect(isTerminRequired([slr1Open], '3')).toBe(false)
  })

  it('ignores radionice in the standard grade flow', () => {
    expect(isTerminRequired([radionicaOpen], '1')).toBe(false)
  })

  it('is false with no open programs at all (no window / empty list)', () => {
    expect(isTerminRequired([], '1')).toBe(false)
  })

  it('requires a termin on the radionica flow when its group is open', () => {
    // Grade omitted — the preselected course drives the requirement.
    expect(isTerminRequired([radionicaOpen, slr1Open], undefined, 'rad')).toBe(true)
  })

  it('stays optional on the radionica flow when its group is full', () => {
    expect(isTerminRequired([radionicaFull], undefined, 'rad-full')).toBe(false)
  })
})
