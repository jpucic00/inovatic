/**
 * The public `/raspored` view of the signup feed.
 *
 * Built ON `getActivePrograms` — the very list the `/prijava` termin dropdown
 * offers — rather than on a loader of its own, so the schedule can never name
 * a termin the form refuses or hide one it offers. The one thing this module
 * adds is the reading a parent wants: termini grouped by weekday and sorted by
 * time, radionice (a date range, not a weekday) set apart, and **no group
 * names**. Because the name is gone, two groups of one program at the same
 * day and time are indistinguishable and would read as a duplicate, so they
 * collapse into ONE slot whose spots are the sum of both — an admin running two
 * parallel SLR 1 groups on Monday wants the page to say "Monday, 17:00, SLR 1,
 * 8 seats", not the same line twice.
 *
 * A program without an open enrollment window still has a timetable: its
 * groups arrive with `availableSpots: null`, and every slot built from them
 * says nothing about seats — no number, no "Popunjeno", no greying.
 *
 * Pure: the page passes the feed in, so the rules are unit-tested without a DB.
 */

import type { ProgramKind } from '@prisma/client'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import { getCourseBySlug } from '@/lib/courses-data'
import { DAYS_HR, formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'

/** A feed group; `availableSpots: null` = its program takes no signups now. */
export type ScheduleGroup = Omit<ActiveGroup, 'availableSpots'> & {
  availableSpots: number | null
}

export type ScheduleProgram = Omit<ActiveProgram, 'groups'> & { groups: ScheduleGroup[] }

export type ScheduleSlot = {
  key: string
  programSlug: string
  programTitle: string
  kind: ProgramKind
  /** The catalog badge ("0"–"4") of a standard program; null for a radionica. */
  badge: string | null
  ageMin: number
  ageMax: number
  /** "17:00–18:30"; empty when the group has no time. */
  time: string
  /** Radionice only: "26.10.2026. – 30.10.2026."; empty for weekly programs. */
  dates: string
  /** Summed over every group merged into this slot; null = signups closed, show no seats. */
  availableSpots: number | null
  isFull: boolean
  /** Distinct venues of the merged groups, formatted by {@link formatVenue}. */
  venues: string[]
}

export type ScheduleDay = { label: string; slots: ScheduleSlot[] }

export type PublicSchedule = {
  /** Ponedjeljak–Subota always; Nedjelja only when something runs on it. */
  weekly: ScheduleDay[]
  radionice: ScheduleSlot[]
  /** Every venue on the page — one entry means the header can name it once. */
  venues: string[]
  isEmpty: boolean
  /** Some slot carries a seat count — the only case the legend means anything. */
  showsSpots: boolean
}

/** A group whose weekday is blank still has to land somewhere visible. */
const UNSCHEDULED_DAY_LABEL = 'Dan u dogovoru'

/**
 * "Velebitska 32, 21000 Split" when the address already names the venue,
 * "Trokut inkubator · Ul. Velimira Škorpika 7/a, 22000 Šibenik" when it does not.
 */
export function formatVenue(name: string, address: string): string {
  const n = name.trim()
  const a = address.trim()
  if (!n) return a
  if (!a) return n
  return a.toLowerCase().includes(n.toLowerCase()) ? a : `${n} · ${a}`
}

type Keyed = {
  slot: ScheduleSlot
  /** Program position in the feed — the catalog order, for same-time ties. */
  order: number
  startTime: string
  dateStart: string
}

function slotKey(program: ScheduleProgram, g: ScheduleGroup): string {
  const time = `${g.startTime ?? ''}|${g.endTime ?? ''}`
  return isRadionica(program.kind)
    ? `${program.id}|${g.dateStart ?? ''}|${g.dateEnd ?? ''}|${time}`
    : `${program.id}|${g.dayOfWeek ?? ''}|${time}`
}

function newSlot(program: ScheduleProgram, g: ScheduleGroup, key: string): ScheduleSlot {
  const radionica = isRadionica(program.kind)
  return {
    key,
    programSlug: program.slug,
    programTitle: program.title,
    kind: program.kind,
    badge: radionica ? null : (getCourseBySlug(program.slug)?.badge ?? null),
    ageMin: program.ageMin,
    ageMax: program.ageMax,
    time: formatGroupSchedule({ startTime: g.startTime, endTime: g.endTime }),
    dates: radionica
      ? formatGroupSchedule({ dateRange: true, dateStart: g.dateStart, dateEnd: g.dateEnd })
      : '',
    availableSpots: g.availableSpots,
    isFull: g.isFull,
    venues: [formatVenue(g.locationName, g.locationAddress)],
  }
}

function mergeInto(slot: ScheduleSlot, g: ScheduleGroup): void {
  // One program is open or closed as a whole, so both sides agree on null.
  if (slot.availableSpots !== null && g.availableSpots !== null) {
    slot.availableSpots += g.availableSpots
    slot.isFull = slot.availableSpots === 0
  }
  const venue = formatVenue(g.locationName, g.locationAddress)
  if (!slot.venues.includes(venue)) slot.venues.push(venue)
}

const byTimeThenOrder = (a: Keyed, b: Keyed) =>
  a.startTime.localeCompare(b.startTime) || a.order - b.order
const byDateThenTime = (a: Keyed, b: Keyed) =>
  a.dateStart.localeCompare(b.dateStart) || byTimeThenOrder(a, b)

export function buildPublicSchedule(programs: ScheduleProgram[]): PublicSchedule {
  // day label → slot key → slot; insertion order of days is irrelevant, the
  // output walks DAYS_HR.
  const weeklyByDay = new Map<string, Map<string, Keyed>>()
  const radionice = new Map<string, Keyed>()

  programs.forEach((program, order) => {
    for (const g of program.groups) {
      const key = slotKey(program, g)
      const bucket = isRadionica(program.kind)
        ? radionice
        : dayBucket(weeklyByDay, g.dayOfWeek || UNSCHEDULED_DAY_LABEL)
      const existing = bucket.get(key)
      if (existing) {
        mergeInto(existing.slot, g)
      } else {
        bucket.set(key, {
          slot: newSlot(program, g, key),
          order,
          startTime: g.startTime ?? '',
          dateStart: g.dateStart ?? '',
        })
      }
    }
  })

  const daySlots = (label: string) =>
    Array.from(weeklyByDay.get(label)?.values() ?? [])
      .sort(byTimeThenOrder)
      .map((k) => k.slot)

  const weekly: ScheduleDay[] = []
  DAYS_HR.forEach((label, i) => {
    const slots = daySlots(label)
    // Sunday is not a teaching day; show it only when a group actually sits there.
    if (i === DAYS_HR.length - 1 && slots.length === 0) return
    weekly.push({ label, slots })
  })
  const unscheduled = daySlots(UNSCHEDULED_DAY_LABEL)
  if (unscheduled.length > 0) weekly.push({ label: UNSCHEDULED_DAY_LABEL, slots: unscheduled })

  const radionicaSlots = Array.from(radionice.values())
    .sort(byDateThenTime)
    .map((k) => k.slot)

  const allSlots = [...weekly.flatMap((d) => d.slots), ...radionicaSlots]
  const venues: string[] = []
  for (const slot of allSlots) {
    for (const v of slot.venues) if (v && !venues.includes(v)) venues.push(v)
  }

  return {
    weekly,
    radionice: radionicaSlots,
    venues,
    isEmpty: allSlots.length === 0,
    showsSpots: allSlots.some((s) => s.availableSpots !== null),
  }
}

function dayBucket(map: Map<string, Map<string, Keyed>>, day: string): Map<string, Keyed> {
  let bucket = map.get(day)
  if (!bucket) {
    bucket = new Map()
    map.set(day, bucket)
  }
  return bucket
}
