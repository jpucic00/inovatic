import { describe, expect, it } from 'vitest'
import { assignLanes } from '@/lib/calendar-lanes'

const ev = (start: number, end: number) => ({ startMinutes: start, endMinutes: end })

describe('assignLanes', () => {
  it('returns empty array for empty input', () => {
    expect(assignLanes([])).toEqual([])
  })

  it('places a single event in lane 0 with laneCount 1', () => {
    expect(assignLanes([ev(600, 690)])).toEqual([{ laneIndex: 0, laneCount: 1 }])
  })

  it('keeps non-overlapping events at full width', () => {
    const result = assignLanes([ev(540, 600), ev(660, 720), ev(780, 840)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 1 },
    ])
  })

  it('treats back-to-back events as non-overlapping', () => {
    const result = assignLanes([ev(600, 720), ev(720, 840)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 1 },
    ])
  })

  it('splits two events sharing the same start into lanes 0 and 1', () => {
    const result = assignLanes([ev(600, 720), ev(600, 720)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
    ])
  })

  it('splits three events sharing the same start into lanes 0, 1, 2', () => {
    const result = assignLanes([ev(600, 720), ev(600, 720), ev(600, 720)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 3 },
      { laneIndex: 1, laneCount: 3 },
      { laneIndex: 2, laneCount: 3 },
    ])
  })

  it('keeps a cluster of partially-overlapping events at the cluster laneCount', () => {
    // A 17:00-18:00, B 17:30-19:00, C 18:30-20:00
    // A overlaps B, B overlaps C, A does not overlap C
    const result = assignLanes([ev(1020, 1080), ev(1050, 1140), ev(1110, 1200)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
      { laneIndex: 0, laneCount: 2 },
    ])
  })

  it('does not bleed the laneCount of one cluster into another', () => {
    // Cluster 1: two overlapping events. Cluster 2: one solitary event.
    const result = assignLanes([ev(540, 600), ev(540, 600), ev(720, 780)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
      { laneIndex: 0, laneCount: 1 },
    ])
  })

  it('returns layouts in original input order regardless of start-time order', () => {
    // Pass them in reverse start order; result must still align with input positions.
    const result = assignLanes([ev(720, 780), ev(540, 600), ev(540, 600)])
    expect(result).toEqual([
      { laneIndex: 0, laneCount: 1 },
      { laneIndex: 0, laneCount: 2 },
      { laneIndex: 1, laneCount: 2 },
    ])
  })
})
