type LaneLayout = {
  laneIndex: number
  laneCount: number
}

export function assignLanes<T extends { startMinutes: number; endMinutes: number }>(
  events: readonly T[],
): LaneLayout[] {
  const n = events.length
  const result: LaneLayout[] = new Array(n)
  if (n === 0) return result

  const sortedIndices = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const sa = events[a].startMinutes
    const sb = events[b].startMinutes
    if (sa !== sb) return sa - sb
    return events[a].endMinutes - events[b].endMinutes
  })

  let clusterIndices: number[] = []
  let laneEnds: number[] = []
  let clusterMaxEnd = 0

  const flushCluster = () => {
    const laneCount = laneEnds.length
    for (const idx of clusterIndices) {
      result[idx].laneCount = laneCount
    }
    clusterIndices = []
    laneEnds = []
    clusterMaxEnd = 0
  }

  for (const idx of sortedIndices) {
    const ev = events[idx]

    if (clusterIndices.length > 0 && ev.startMinutes >= clusterMaxEnd) {
      flushCluster()
    }

    let laneIdx = laneEnds.findIndex((endT) => endT <= ev.startMinutes)
    if (laneIdx === -1) {
      laneIdx = laneEnds.length
      laneEnds.push(ev.endMinutes)
    } else {
      laneEnds[laneIdx] = ev.endMinutes
    }

    result[idx] = { laneIndex: laneIdx, laneCount: 0 }
    clusterIndices.push(idx)
    if (ev.endMinutes > clusterMaxEnd) clusterMaxEnd = ev.endMinutes
  }

  if (clusterIndices.length > 0) flushCluster()

  return result
}
