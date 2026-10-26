import { describe, expect, it } from 'vitest'
import { lessonPlacementError } from '@/lib/lesson-rules'

describe('lessonPlacementError', () => {
  it('accepts a standard lesson on sats of its module', () => {
    expect(
      lessonPlacementError({ kind: 'STANDARD', moduleId: 'm1', isFirstModule: false, sessionNumbers: [1, 2] }),
    ).toBeNull()
  })

  it('accepts a standard lesson with no sats picked yet', () => {
    expect(
      lessonPlacementError({ kind: 'STANDARD', moduleId: 'm1', isFirstModule: false, sessionNumbers: [] }),
    ).toBeNull()
  })

  it('requires a module for a standard or competition lesson', () => {
    for (const kind of ['STANDARD', 'COMPETITION'] as const) {
      expect(
        lessonPlacementError({ kind, moduleId: null, isFirstModule: false, sessionNumbers: [] }),
      ).toMatch(/modul/)
    }
  })

  it('puts a radionica lesson directly under the program, undated', () => {
    expect(
      lessonPlacementError({ kind: 'RADIONICA', moduleId: null, isFirstModule: false, sessionNumbers: [] }),
    ).toBeNull()
    expect(
      lessonPlacementError({ kind: 'RADIONICA', moduleId: 'm1', isFirstModule: true, sessionNumbers: [] }),
    ).toMatch(/Radionica nema module/)
    expect(
      lessonPlacementError({ kind: 'RADIONICA', moduleId: null, isFirstModule: false, sessionNumbers: [1] }),
    ).toMatch(/nemaju sate/)
  })

  it('lets a natjecanje lesson hold weekly season sats 1–52, never a probni sat', () => {
    const at = (sessionNumbers: number[]) =>
      lessonPlacementError({ kind: 'COMPETITION', moduleId: 'm1', isFirstModule: true, sessionNumbers })
    expect(at([])).toBeNull()
    expect(at([1])).toBeNull()
    expect(at([12, 13, 52])).toBeNull()
    expect(at([0])).toMatch(/između 1 i 52/)
    expect(at([53])).toMatch(/između 1 i 52/)
  })

  it('keeps a standard lesson inside the module\'s 7 sats', () => {
    expect(
      lessonPlacementError({ kind: 'STANDARD', moduleId: 'm1', isFirstModule: false, sessionNumbers: [8] }),
    ).toMatch(/7 sati/)
  })

  it('allows the probni sat only on the first module', () => {
    expect(
      lessonPlacementError({ kind: 'STANDARD', moduleId: 'm1', isFirstModule: true, sessionNumbers: [0] }),
    ).toBeNull()
    expect(
      lessonPlacementError({ kind: 'STANDARD', moduleId: 'm2', isFirstModule: false, sessionNumbers: [0, 1] }),
    ).toMatch(/Probni sat/)
  })
})
