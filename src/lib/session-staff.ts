/**
 * Who actually staffs a group on one termin.
 *
 * The group's regular staff (`TeacherAssignment`, each a predavač or asistent)
 * is overridden per date by `SessionStaffChange` rows, which only an admin
 * writes. A change applies to its own date and nothing else, which is how a
 * substitute "comes off" the group the next day without anything having to run:
 * the row stays behind as history of who covered whom.
 *
 * `effectiveStaffFor` is the one definition. The Dolazak marker, the server's
 * booking of teaching hours, and every staff label read it — so the hours
 * booked can never disagree with the names shown for the same termin.
 *
 * Plain module with structural types: the attendance marker is a client
 * component and must not pull `@/lib/db` into the bundle.
 */
import { zagrebDateKey } from './attendance-window'
import { fromDateKey, parseCroatianWeekday } from './session-dates'

export type StaffRole = 'LEAD' | 'ASSISTANT'

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  LEAD: 'Predavač',
  ASSISTANT: 'Asistent',
}

export const STAFF_ROLES: readonly StaffRole[] = ['LEAD', 'ASSISTANT']

export interface RegularStaffMember {
  userId: string
  name: string
  role: StaffRole
}

export interface StaffChange {
  /** YYYY-MM-DD */
  sessionDate: string
  userId: string
  name: string
  role: StaffRole
  replacesUserId: string | null
  replacesName: string | null
}

interface SessionStaffMember {
  userId: string
  name: string
  role: StaffRole
  /** On this termin through a change rather than the group's regular staff. */
  isChange: boolean
  /** Also on the group's regular staff (a change then only alters the role). */
  isRegular: boolean
  /** Set when this person stands in for a regular staff member. */
  replacesUserId: string | null
  replacesName: string | null
}

const ROLE_ORDER: Record<StaffRole, number> = { LEAD: 0, ASSISTANT: 1 }

export function compareStaff(
  a: { role: StaffRole; name: string },
  b: { role: StaffRole; name: string },
): number {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, 'hr')
}

/**
 * The regular staff, minus anyone a change on `dateKey` replaces, plus the
 * people those changes bring in. A regular who is ALSO the subject of a change
 * that day (a predavač working as asistent for one termin) appears once, with
 * the change's role.
 */
export function effectiveStaffFor(
  regular: readonly RegularStaffMember[],
  changes: readonly StaffChange[],
  dateKey: string,
): SessionStaffMember[] {
  const today = changes.filter((c) => c.sessionDate === dateKey)
  const replaced = new Set(today.map((c) => c.replacesUserId).filter((id) => id !== null))
  const changed = new Set(today.map((c) => c.userId))

  const staff: SessionStaffMember[] = regular
    .filter((r) => !replaced.has(r.userId) && !changed.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      role: r.role,
      isChange: false,
      isRegular: true,
      replacesUserId: null,
      replacesName: null,
    }))
  const regularIds = new Set(regular.map((r) => r.userId))
  for (const c of today) {
    staff.push({
      userId: c.userId,
      name: c.name,
      role: c.role,
      isChange: true,
      isRegular: regularIds.has(c.userId),
      replacesUserId: c.replacesUserId,
      replacesName: c.replacesName,
    })
  }
  return staff.sort(compareStaff)
}

/**
 * The first termin date a change still grants access for. A substitute sees the
 * group from the moment the admin adds them until the end of the termin's own
 * day (Europe/Zagreb) — enough to prepare with the materials, and gone the day
 * after with no cleanup step.
 */
export function staffChangeAccessFrom(now: Date): Date {
  const [y, m, d] = zagrebDateKey(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * The one phrasing for a change: "Zamjena · umjesto: Ivo Horvat", a regular
 * whose role differs for this termin only, or an extra person. The colon form
 * keeps the stored (nominative) name grammatical without declining it.
 */
export function staffChangeLabel(change: {
  replacesName: string | null
  isRegular: boolean
}): string {
  if (change.replacesName) return `Zamjena · umjesto: ${change.replacesName}`
  return change.isRegular ? 'Uloga samo na ovom terminu' : 'Dodatno na terminu'
}

/**
 * A group's regular staff as header text: predavači first, then asistenti,
 * each asistent marked. One rendering so the teacher panel, the portal header
 * and the student profile cannot word the roles differently.
 */
export function staffDisplayNames(
  staff: readonly { role: StaffRole; name: string }[],
): string[] {
  return [...staff]
    .sort(compareStaff)
    .map((s) => (s.role === 'ASSISTANT' ? `${s.name} (asistent)` : s.name))
}

/**
 * Why `dateKey` cannot carry a staff change for this group, or null when it
 * can. A change must land on a day the group could meet: inside a radionica's
 * range, or on a standard/competition group's weekday — deliberately not only on
 * a computed termin, so a hand-added Dolazak date can be covered too. A holiday
 * is refused, since nothing is taught (and the holiday cascade clears changes).
 */
export function staffChangeDateError(
  group: { dayOfWeek: string | null; dateStart: string | null; dateEnd: string | null },
  dateKey: string,
  holidays: ReadonlySet<string>,
): string | null {
  if (holidays.has(dateKey)) return 'Na taj datum je praznik — termin se ne održava.'
  if (group.dateStart || group.dateEnd) {
    if (group.dateStart && dateKey < group.dateStart) return 'Datum je prije početka radionice.'
    if (group.dateEnd && dateKey > group.dateEnd) return 'Datum je nakon završetka radionice.'
    return null
  }
  const weekday = parseCroatianWeekday(group.dayOfWeek)
  if (weekday === null) return 'Grupa nema zadan dan održavanja.'
  if (fromDateKey(dateKey).getUTCDay() !== weekday) {
    return `Grupa se održava samo na dan: ${group.dayOfWeek}.`
  }
  return null
}

export interface SessionTeacherRow {
  userId: string
  name: string
  /** On this termin's effective staff, hence bookable. */
  assigned: boolean
  role: StaffRole | null
  changeLabel: string | null
}

/**
 * The Dolazak marker's rows for one date: the termin's effective staff, then
 * everyone else the group knows about (a replaced regular, a former teacher),
 * who the marker only shows read-only when they already have hours on it.
 */
export function sessionTeacherRows(
  regular: readonly RegularStaffMember[],
  changes: readonly StaffChange[],
  dateKey: string,
  known: readonly { userId: string; name: string }[],
): SessionTeacherRow[] {
  const staff = effectiveStaffFor(regular, changes, dateKey)
  const onStaff = new Set(staff.map((s) => s.userId))
  return [
    ...staff.map((s) => ({
      userId: s.userId,
      name: s.name,
      assigned: true,
      role: s.role,
      changeLabel: s.isChange ? staffChangeLabel(s) : null,
    })),
    ...known
      .filter((k) => !onStaff.has(k.userId))
      .map((k) => ({ userId: k.userId, name: k.name, assigned: false, role: null, changeLabel: null })),
  ]
}

export interface TerminSection {
  title: string
  /** YYYY-MM-DD, ascending, today or later only. */
  dates: string[]
}

type AttendanceDates =
  | { kind: 'custom' | 'season'; expectedSessions: string[]; extraSessions: string[] }
  | {
      kind: 'standard'
      sections: {
        moduleIndex: number
        moduleTitle: string
        expectedSessions: string[]
        adhocSessions: string[]
      }[]
      otherDates: string[]
    }

/**
 * The termini a substitute can still be put on, grouped the way the Dolazak tab
 * groups them (probni sat, one block per module, then hand-added dates), so the
 * admin picks from the same dates teachers mark attendance on. Past termini are
 * dropped: covering a session that is over is a correction to the hours, not a
 * staffing decision.
 */
export function upcomingTerminSections(
  attendance: AttendanceDates,
  todayKey: string,
): TerminSection[] {
  const upcoming = (dates: string[]) =>
    [...new Set(dates)].filter((d) => d >= todayKey).sort((a, b) => a.localeCompare(b))

  const raw: TerminSection[] =
    attendance.kind === 'standard'
      ? [
          ...attendance.sections.map((s) => ({
            title: s.moduleIndex === 0 ? s.moduleTitle : `Modul ${s.moduleIndex}: ${s.moduleTitle}`,
            dates: upcoming([...s.expectedSessions, ...s.adhocSessions]),
          })),
          { title: 'Ostali termini', dates: upcoming(attendance.otherDates) },
        ]
      : [
          {
            title: 'Termini',
            dates: upcoming([...attendance.expectedSessions, ...attendance.extraSessions]),
          },
        ]
  return raw.filter((s) => s.dates.length > 0)
}
