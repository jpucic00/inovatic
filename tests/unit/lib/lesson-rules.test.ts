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

  it('keeps natjecanje lessons undated', () => {
    expect(
      lessonPlacementError({ kind: 'COMPETITION', moduleId: 'm1', isFirstModule: true, sessionNumbers: [] }),
    ).toBeNull()
    expect(
      lessonPlacementError({ kind: 'COMPETITION', moduleId: 'm1', isFirstModule: true, sessionNumbers: [1] }),
    ).toMatch(/nemaju sate/)
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
