import { describe, expect, it } from 'vitest'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import {
  hasOpenTermin,
  isTerminRequired,
  programsForSelection,
} from '@/lib/inquiry-availability'

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
    isFull,
  }
}

function program(
  id: string,
  opts: Readonly<{ isCustom?: boolean; level?: string | null; groups?: ActiveGroup[] }> = {},
): ActiveProgram {
  return {
    id,
    slug: id,
    title: `Program ${id}`,
    level: opts.level ?? 'SLR_1',
    isCustom: opts.isCustom ?? false,
    ageMin: 6,
    ageMax: 14,
    price: 50,
    groups: opts.groups ?? [group()],
  }
}

const slr1Open = program('slr1', { level: 'SLR_1', groups: [group()] })
const slr1Full = program('slr1-full', { level: 'SLR_1', groups: [group(true)] })
const slr2Open = program('slr2', { level: 'SLR_2', groups: [group()] })
const radionicaOpen = program('rad', { isCustom: true, level: null, groups: [group()] })
const radionicaFull = program('rad-full', { isCustom: true, level: null, groups: [group(true)] })

describe('programsForSelection', () => {
  it('narrows the standard flow to the selected grade\'s level and drops radionice', () => {
    const result = programsForSelection([slr1Open, slr2Open, radionicaOpen], '1')
    expect(result.map((p) => p.id)).toEqual(['slr1'])
  })

  it('returns every standard program when no grade is chosen yet', () => {
    const result = programsForSelection([slr1Open, slr2Open, radionicaOpen], '')
    expect(result.map((p) => p.id)).toEqual(['slr1', 'slr2'])
  })

  it('returns only the preselected course regardless of grade', () => {
    const result = programsForSelection([radionicaOpen, slr1Open], '5', 'rad')
    expect(result.map((p) => p.id)).toEqual(['rad'])
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
    expect(isTerminRequired([slr1Open], 'predskolci')).toBe(true)
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
