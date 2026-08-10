import type { ProgramKind } from '@prisma/client'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'
import type { GroupOption } from '../../emails/schedule-options'

/** The columns a schedule box reads off a group row. */
export type GroupOptionSource = {
  name: string | null
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  location: { name: string; address: string }
  course: { kind: ProgramKind }
}

/**
 * Group rows → the termin boxes an invitation renders.
 *
 * Split out of `buildTargetOptions` so the send path and the campaign archive
 * view can share the mapping while differing on strictness: a send refuses when
 * a selected group cannot be loaded, while looking back at an already-sent
 * campaign has to cope with a group deleted since.
 */
export function toGroupOptions(groups: readonly GroupOptionSource[]): GroupOption[] {
  return groups.map((g) => ({
    groupName: g.name ?? 'Grupa',
    schedule: formatGroupSchedule({
      dateRange: isRadionica(g.course.kind),
      dayOfWeek: g.dayOfWeek,
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      startTime: g.startTime,
      endTime: g.endTime,
    }),
    locationName: g.location.name,
    locationAddress: g.location.address,
  }))
}
