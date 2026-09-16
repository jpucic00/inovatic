import type { ProgramKind } from '@prisma/client'
import { formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

/**
 * One group's termin as a PARENT reads it: which program, which group, when
 * and where. Every field is display-ready, so the templates that carry it (the
 * inquiry confirmation's "Odabrani termin" box, the schedule campaign's
 * per-child cards) render it without knowing what a ScheduledGroup is.
 *
 * The address rides along with the venue name on purpose — a bare "Trokut" is
 * not something a first-time parent can drive to.
 */
export type GroupTermin = {
  programTitle: string
  /** The group's own name; null when the admin left it blank. */
  groupName: string | null
  /** "Utorak · 17:00–18:30", or a radionica's "15.07.2026. – 21.07.2026. · 09:00–11:00". */
  schedule: string
  locationName: string
  locationAddress: string
}

/** Everything {@link toGroupTermin} reads off a group — pass as a Prisma `select`. */
export const GROUP_TERMIN_SELECT = {
  name: true,
  dayOfWeek: true,
  dateStart: true,
  dateEnd: true,
  startTime: true,
  endTime: true,
  course: { select: { title: true, kind: true } },
  location: { select: { name: true, address: true } },
} as const

type GroupTerminSource = {
  name: string | null
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  course: { title: string; kind: ProgramKind }
  location: { name: string; address: string }
}

export function toGroupTermin(group: GroupTerminSource): GroupTermin {
  return {
    programTitle: group.course.title,
    groupName: group.name,
    schedule: formatGroupSchedule({
      // A radionica runs a closed date range; everything else runs weekly. Same
      // discriminator the public and admin group lines use.
      dateRange: isRadionica(group.course.kind),
      dayOfWeek: group.dayOfWeek,
      dateStart: group.dateStart,
      dateEnd: group.dateEnd,
      startTime: group.startTime,
      endTime: group.endTime,
    }),
    locationName: group.location.name,
    locationAddress: group.location.address,
  }
}
