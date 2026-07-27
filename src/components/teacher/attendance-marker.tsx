'use client'

import { useMemo, useState, useTransition } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Lock, Plus, Save, X } from 'lucide-react'
import type { MarkingWindow } from '@/lib/attendance-window'
import { DateInput } from '@/components/ui/date-input'
import { toast } from 'sonner'
import { bulkMarkSession } from '@/actions/teacher/attendance'
import type {
  AttendanceModuleSection,
  AttendanceRecord,
  AttendanceRosterRow,
  GroupAttendance,
  TeacherAttendanceRecord,
  TeacherAttendanceRow,
} from '@/actions/teacher/attendance'
import { assignAdhocDateToSection } from '@/lib/attendance-sections'
import { formatDate } from '@/lib/format'
import { fromDateKey, todayUtc, toDateKey } from '@/lib/session-dates'

type Draft = Record<string, { present: boolean; note: string }>

type SectionKey = number | 'other'

function indexRecords(
  records: AttendanceRecord[],
): Map<string, Map<string, AttendanceRecord>> {
  const map = new Map<string, Map<string, AttendanceRecord>>()
  for (const r of records) {
    let byEnrollment = map.get(r.sessionDate)
    if (!byEnrollment) {
      byEnrollment = new Map()
      map.set(r.sessionDate, byEnrollment)
    }
    byEnrollment.set(r.enrollmentId, r)
  }
  return map
}

function sessionLabel(key: string): string {
  return formatDate(fromDateKey(key))
}

function markedCount(
  roster: AttendanceRosterRow[],
  byEnrollment: Map<string, AttendanceRecord> | undefined,
): number {
  if (!byEnrollment) return 0
  return roster.reduce(
    (n, r) => (byEnrollment.has(r.enrollmentId) ? n + 1 : n),
    0,
  )
}

function initDraft(
  roster: AttendanceRosterRow[],
  existing: Map<string, AttendanceRecord> | undefined,
): Draft {
  const draft: Draft = {}
  for (const r of roster) {
    const rec = existing?.get(r.enrollmentId)
    draft[r.enrollmentId] = {
      present: rec ? rec.present : true,
      note: rec?.note ?? '',
    }
  }
  return draft
}

function makeDraftHandlers(setDraft: Dispatch<SetStateAction<Draft>>): {
  togglePresent: (enrollmentId: string) => void
  setNote: (enrollmentId: string, note: string) => void
} {
  return {
    togglePresent: (enrollmentId) => {
      setDraft((prev) => ({
        ...prev,
        [enrollmentId]: {
          present: !prev[enrollmentId]?.present,
          note: prev[enrollmentId]?.note ?? '',
        },
      }))
    },
    setNote: (enrollmentId, note) => {
      setDraft((prev) => ({
        ...prev,
        [enrollmentId]: {
          present: prev[enrollmentId]?.present ?? false,
          note,
        },
      }))
    },
  }
}

type TeacherDraft = Record<string, boolean>

function indexTeacherRecords(
  records: TeacherAttendanceRecord[],
): Map<string, Map<string, boolean>> {
  const map = new Map<string, Map<string, boolean>>()
  for (const r of records) {
    let byUser = map.get(r.sessionDate)
    if (!byUser) {
      byUser = new Map()
      map.set(r.sessionDate, byUser)
    }
    byUser.set(r.userId, r.present)
  }
  return map
}

/** Assigned teachers default to present — the common case is "we both taught". */
function initTeacherDraft(
  teachers: TeacherAttendanceRow[],
  existing: Map<string, boolean> | undefined,
): TeacherDraft {
  const draft: TeacherDraft = {}
  for (const t of teachers) {
    if (!t.assigned) continue
    draft[t.userId] = existing?.get(t.userId) ?? true
  }
  return draft
}

function makeTeacherToggle(
  setDraft: Dispatch<SetStateAction<TeacherDraft>>,
): (userId: string) => void {
  return (userId) => {
    setDraft((prev) => ({ ...prev, [userId]: !(prev[userId] ?? true) }))
  }
}

/** Picking a date resets both drafts to whatever is already recorded for it. */
function makePickDate(ctx: {
  setSelected: Dispatch<SetStateAction<string>>
  setDraft: Dispatch<SetStateAction<Draft>>
  setTeacherDraft: Dispatch<SetStateAction<TeacherDraft>>
  roster: AttendanceRosterRow[]
  recordIndex: Map<string, Map<string, AttendanceRecord>>
  teachers: TeacherAttendanceRow[]
  teacherIndex: Map<string, Map<string, boolean>>
}): (key: string) => void {
  return (key) => {
    ctx.setSelected(key)
    ctx.setDraft(initDraft(ctx.roster, ctx.recordIndex.get(key)))
    ctx.setTeacherDraft(initTeacherDraft(ctx.teachers, ctx.teacherIndex.get(key)))
  }
}

/** Only assigned teachers are bookable; the server enforces the same rule. */
function toTeacherEntries(
  teachers: TeacherAttendanceRow[],
  draft: TeacherDraft,
): { userId: string; present: boolean }[] {
  return teachers
    .filter((t) => t.assigned)
    .map((t) => ({ userId: t.userId, present: draft[t.userId] ?? true }))
}

interface TeacherSectionProps {
  teachers: TeacherAttendanceRow[]
  draft: TeacherDraft
  existing: Map<string, boolean> | undefined
  onToggle: (userId: string) => void
  readOnly: boolean
}

/**
 * Teaching hours for the selected session. Only shown when the group has more
 * than one teacher — a single teacher is booked automatically on save.
 */
function TeacherSection({
  teachers,
  draft,
  existing,
  onToggle,
  readOnly,
}: Readonly<TeacherSectionProps>) {
  const assigned = teachers.filter((t) => t.assigned)
  const historic = teachers.filter((t) => !t.assigned && existing?.has(t.userId))
  if (assigned.length < 2 && historic.length === 0) return null

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        Nastavnici na terminu
      </h4>
      <p className="text-[11px] text-gray-500 mb-2.5">
        Označite tko je stvarno održao ovaj termin — po tome se broje sati.
      </p>
      <div className="flex flex-wrap gap-2">
        {assigned.map((t) => {
          const present = draft[t.userId] ?? true
          return (
            <button
              key={t.userId}
              type="button"
              onClick={() => onToggle(t.userId)}
              disabled={readOnly}
              aria-pressed={present}
              aria-label={`${t.name} — ${present ? 'prisutan' : 'odsutan'}`}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-60',
                present
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200',
              ].join(' ')}
            >
              {present ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {t.name}
            </button>
          )
        })}
        {historic.map((t) => (
          <span
            key={t.userId}
            title="Više nije dodijeljen ovoj grupi — evidentirani sati ostaju."
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500"
          >
            {existing?.get(t.userId) ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            {t.name}
            <span className="text-[9px] uppercase tracking-wide">bivši</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function scheduleHint(
  isCustom: boolean,
  dayOfWeek: string | null,
  dateStart: string | null,
  dateEnd: string | null,
  startTime: string | null,
  endTime: string | null,
): string | null {
  const endSuffix = endTime ? `–${endTime}` : ''
  const timeRange = startTime ? ` · ${startTime}${endSuffix}` : ''
  if (isCustom && dateStart && dateEnd) {
    const rangeLabel =
      dateStart === dateEnd
        ? formatDate(fromDateKey(dateStart))
        : `${formatDate(fromDateKey(dateStart))} – ${formatDate(fromDateKey(dateEnd))}`
    return `${rangeLabel}${timeRange}`
  }
  if (dayOfWeek) return `${dayOfWeek}${timeRange}`
  return null
}

interface DateButtonProps {
  dateKey: string
  isActive: boolean
  marked: number
  total: number
  onPick: (key: string) => void
}

function DateButton({ dateKey, isActive, marked, total, onPick }: Readonly<DateButtonProps>) {
  const isFuture = dateKey > toDateKey(todayUtc())
  let chipClass = 'bg-gray-100 text-gray-500'
  if (total > 0 && marked === total) chipClass = 'bg-emerald-100 text-emerald-700'
  else if (marked > 0) chipClass = 'bg-amber-100 text-amber-700'
  return (
    <button
      type="button"
      onClick={() => onPick(dateKey)}
      className={[
        'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md border transition-colors text-left',
        isActive
          ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
          : 'border-gray-200 bg-white hover:border-gray-300',
      ].join(' ')}
    >
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{sessionLabel(dateKey)}</span>
        {isFuture ? (
          <span className="block text-[11px] text-gray-400">nadolazeći</span>
        ) : null}
      </span>
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
          chipClass,
        ].join(' ')}
      >
        {marked}/{total}
      </span>
    </button>
  )
}

interface AdhocInputProps {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
}

function AdhocInputBox({ value, onChange, onAdd }: Readonly<AdhocInputProps>) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <label htmlFor="adhoc-date" className="block text-xs font-medium text-gray-600 mb-1.5">
        Dodaj datum ručno
      </label>
      <div className="flex gap-2">
        <DateInput
          id="adhoc-date"
          value={value}
          onChange={onChange}
          className="flex-1 min-w-0 w-full px-2 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!value}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Dodaj
        </button>
      </div>
    </div>
  )
}

/**
 * Why the selected session can no longer be written, or null when it can.
 * Teachers get a window; admins get `null` and are never locked.
 */
function lockReason(window: MarkingWindow | null, dateKey: string): string | null {
  if (!window) return null
  if (dateKey > window.today) return 'Termin još nije održan.'
  if (dateKey < window.firstOfMonth) {
    return 'Prošli mjesec — za izmjenu se javite administratoru.'
  }
  return null
}

interface RosterTableProps {
  visibleRoster: AttendanceRosterRow[]
  draft: Draft
  selected: string
  recordIndex: Map<string, Map<string, AttendanceRecord>>
  onToggle: (enrollmentId: string) => void
  onNote: (enrollmentId: string, note: string) => void
  readOnly: boolean
}

function RosterTable({
  visibleRoster,
  draft,
  selected,
  recordIndex,
  onToggle,
  onNote,
  readOnly,
}: Readonly<RosterTableProps>) {
  if (visibleRoster.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 text-center">
        Nema polaznika upisanih u odabrani modul.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Polaznik</th>
            <th className="px-4 py-2.5 text-center font-medium w-32">Prisutan</th>
            <th className="px-4 py-2.5 text-left font-medium">Bilješka</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleRoster.map((r) => {
            const d = draft[r.enrollmentId] ?? { present: false, note: '' }
            const existing = recordIndex.get(selected)?.get(r.enrollmentId)
            return (
              <tr key={r.enrollmentId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {r.lastName} {r.firstName}
                  {existing?.recordedBy ? (
                    <span
                      className="block text-[11px] font-normal text-gray-400"
                      title="Zapisao"
                    >
                      {existing.recordedBy}
                      {existing.recordedByDeleted ? (
                        <span className="ml-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                          Bivši nastavnik
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => onToggle(r.enrollmentId)}
                      disabled={readOnly}
                      aria-pressed={d.present}
                      aria-label={d.present ? 'Prisutan' : 'Odsutan'}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-inherit',
                        d.present
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200',
                      ].join(' ')}
                    >
                      {d.present ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Prisutan
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" /> Odsutan
                        </>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={d.note}
                    onChange={(e) => onNote(r.enrollmentId, e.target.value)}
                    readOnly={readOnly}
                    placeholder={readOnly ? '' : 'npr. opravdano, zakasnio'}
                    aria-label={`Bilješka — ${r.lastName} ${r.firstName}`}
                    className="w-full px-2 py-1 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 read-only:bg-gray-50 read-only:text-gray-500"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Public component ───────────────────────────────────────────────────────

export function AttendanceMarker(props: Readonly<GroupAttendance>) {
  if (props.kind === 'custom') return <RadionicaAttendanceMarker {...props} />
  return <StandardAttendanceMarker {...props} />
}

// ─── Radionica (flat) branch ────────────────────────────────────────────────

type RadionicaProps = Extract<GroupAttendance, { kind: 'custom' }>

function pickRadionicaDefault(expected: string[], extras: string[]): string {
  const today = toDateKey(todayUtc())
  const all = [...new Set([...expected, ...extras])].sort((a, b) =>
    a.localeCompare(b),
  )
  if (all.length === 0) return today
  if (all.includes(today)) return today
  const past = all.filter((d) => d <= today)
  if (past.length > 0) return past.at(-1)!
  return all[0]
}

function RadionicaAttendanceMarker({
  groupId,
  dayOfWeek,
  dateStart,
  dateEnd,
  startTime,
  endTime,
  expectedSessions,
  extraSessions,
  roster,
  records,
  teachers,
  teacherRecords,
  markingWindow,
}: Readonly<RadionicaProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const recordIndex = useMemo(() => indexRecords(records), [records])
  const teacherIndex = useMemo(
    () => indexTeacherRecords(teacherRecords),
    [teacherRecords],
  )
  const [adhocDates, setAdhocDates] = useState<string[]>([])
  const allDates = useMemo(() => {
    const merged = [
      ...new Set([...expectedSessions, ...extraSessions, ...adhocDates]),
    ]
    merged.sort((a, b) => a.localeCompare(b))
    return merged
  }, [expectedSessions, extraSessions, adhocDates])

  const [selected, setSelected] = useState<string>(() =>
    pickRadionicaDefault(expectedSessions, extraSessions),
  )
  const [draft, setDraft] = useState<Draft>(() =>
    initDraft(roster, recordIndex.get(selected)),
  )
  const [teacherDraft, setTeacherDraft] = useState<TeacherDraft>(() =>
    initTeacherDraft(teachers, teacherIndex.get(selected)),
  )
  const [newDateInput, setNewDateInput] = useState('')

  const handlePickDate = makePickDate({
    setSelected,
    setDraft,
    setTeacherDraft,
    roster,
    recordIndex,
    teachers,
    teacherIndex,
  })

  const handleAddAdhoc = () => {
    if (!newDateInput) return
    const key = newDateInput
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      toast.error('Neispravan datum.')
      return
    }
    if (!adhocDates.includes(key) && !allDates.includes(key)) {
      setAdhocDates((prev) => [...prev, key])
    }
    handlePickDate(key)
    setNewDateInput('')
  }

  const { togglePresent, setNote } = makeDraftHandlers(setDraft)
  const toggleTeacher = makeTeacherToggle(setTeacherDraft)
  const locked = lockReason(markingWindow, selected)

  const handleSave = () => {
    const entries = roster.map((r) => ({
      enrollmentId: r.enrollmentId,
      present: draft[r.enrollmentId]?.present ?? false,
      note: draft[r.enrollmentId]?.note?.trim() || null,
    }))
    startTransition(async () => {
      const res = await bulkMarkSession({
        groupId,
        sessionDate: selected,
        entries,
        teacherEntries: toTeacherEntries(teachers, teacherDraft),
      })
      if (res.success) {
        toast.success('Evidencija spremljena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  if (roster.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">Nema upisanih polaznika u ovu grupu.</p>
      </div>
    )
  }

  const hint = scheduleHint(true, dayOfWeek, dateStart, dateEnd, startTime, endTime)

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Termini</h3>
          {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        </div>

        {allDates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-xs text-gray-500">
            Nema definiranih datuma za ovu radionicu. Dodajte termin ručno ispod.
          </p>
        ) : (
          <ul className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {allDates.map((key) => (
              <li key={key}>
                <DateButton
                  dateKey={key}
                  isActive={key === selected}
                  marked={markedCount(roster, recordIndex.get(key))}
                  total={roster.length}
                  onPick={handlePickDate}
                />
              </li>
            ))}
          </ul>
        )}

        <AdhocInputBox
          value={newDateInput}
          onChange={setNewDateInput}
          onAdd={handleAddAdhoc}
        />
      </aside>

      <section>
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {sessionLabel(selected)}
            </h3>
            <p className="text-xs text-gray-500">
              {locked
                ? 'Evidencija je samo za pregled.'
                : 'Označite prisutnost za svakog polaznika i spremite.'}
            </p>
          </div>
          <SaveButton isPending={isPending} onClick={handleSave} locked={locked} />
        </header>

        <TeacherSection
          teachers={teachers}
          draft={teacherDraft}
          existing={teacherIndex.get(selected)}
          onToggle={toggleTeacher}
          readOnly={locked !== null}
        />

        <RosterTable
          visibleRoster={roster}
          draft={draft}
          selected={selected}
          recordIndex={recordIndex}
          onToggle={togglePresent}
          onNote={setNote}
          readOnly={locked !== null}
        />
      </section>
    </div>
  )
}

function SaveButton({
  isPending,
  onClick,
  locked,
}: Readonly<{ isPending: boolean; onClick: () => void; locked: string | null }>) {
  // Outside the marking window there is nothing to save, so show the reason
  // instead of a button that would only fail server-side.
  if (locked) {
    return (
      <p className="flex items-center gap-1.5 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        {locked}
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      Spremi
    </button>
  )
}

// ─── Standard (sectioned) branch ────────────────────────────────────────────

type StandardProps = Extract<GroupAttendance, { kind: 'standard' }>

function findSectionForDate(
  dateKey: string,
  sections: AttendanceModuleSection[],
  otherSet: Set<string>,
): SectionKey | null {
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].expectedSessions.includes(dateKey)) return i
    if (sections[i].adhocSessions.includes(dateKey)) return i
  }
  // Ad-hoc that wasn't pre-bucketed: assign by date range.
  const byRange = assignAdhocDateToSection(dateKey, sections)
  if (byRange !== null) return byRange
  if (otherSet.has(dateKey)) return 'other'
  return null
}

function StandardAttendanceMarker({
  groupId,
  dayOfWeek,
  dateStart,
  dateEnd,
  startTime,
  endTime,
  sections,
  otherDates,
  defaultSelectedDate,
  roster,
  records,
  teachers,
  teacherRecords,
  markingWindow,
}: Readonly<StandardProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const recordIndex = useMemo(() => indexRecords(records), [records])
  const teacherIndex = useMemo(
    () => indexTeacherRecords(teacherRecords),
    [teacherRecords],
  )

  const [selected, setSelected] = useState<string>(defaultSelectedDate)
  const [adhocDates, setAdhocDates] = useState<string[]>([])
  const [newDateInput, setNewDateInput] = useState('')

  const sectionWindows = useMemo(
    () =>
      sections.map((s) => ({
        firstSession: s.firstSession,
        lastSession: s.lastSession,
      })),
    [sections],
  )

  // Place locally-added ad-hoc dates into the matching section or "Ostali termini".
  const { perSection: adhocPerSection, other: adhocOther } = useMemo(() => {
    const perSection: string[][] = sections.map(() => [])
    const other: string[] = []
    for (const key of adhocDates) {
      const idx = assignAdhocDateToSection(key, sectionWindows)
      if (idx === null) other.push(key)
      else perSection[idx].push(key)
    }
    return { perSection, other }
  }, [adhocDates, sections, sectionWindows])

  const otherDatesAll = useMemo(() => {
    const merged = [...new Set([...otherDates, ...adhocOther])]
    merged.sort((a, b) => a.localeCompare(b))
    return merged
  }, [otherDates, adhocOther])

  const otherSet = useMemo(() => new Set(otherDatesAll), [otherDatesAll])

  const enrollmentSets = useMemo(
    () => sections.map((s) => new Set(s.enrolledEnrollmentIds)),
    [sections],
  )

  const selectedSection: SectionKey | null = useMemo(
    () => findSectionForDate(selected, sections, otherSet),
    [selected, sections, otherSet],
  )

  const visibleRoster = useMemo(() => {
    if (selectedSection === null || selectedSection === 'other') return roster
    const set = enrollmentSets[selectedSection]
    return roster.filter((r) => set.has(r.enrollmentId))
  }, [selectedSection, enrollmentSets, roster])

  const [draft, setDraft] = useState<Draft>(() =>
    initDraft(roster, recordIndex.get(defaultSelectedDate)),
  )
  const [teacherDraft, setTeacherDraft] = useState<TeacherDraft>(() =>
    initTeacherDraft(teachers, teacherIndex.get(defaultSelectedDate)),
  )

  const handlePickDate = makePickDate({
    setSelected,
    setDraft,
    setTeacherDraft,
    roster,
    recordIndex,
    teachers,
    teacherIndex,
  })

  const handleAddAdhoc = () => {
    if (!newDateInput) return
    const key = newDateInput
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      toast.error('Neispravan datum.')
      return
    }
    const alreadyKnown =
      adhocDates.includes(key) ||
      sections.some(
        (s) => s.expectedSessions.includes(key) || s.adhocSessions.includes(key),
      ) ||
      otherDates.includes(key)
    if (!alreadyKnown) setAdhocDates((prev) => [...prev, key])
    handlePickDate(key)
    setNewDateInput('')
  }

  const { togglePresent, setNote } = makeDraftHandlers(setDraft)
  const toggleTeacher = makeTeacherToggle(setTeacherDraft)
  const locked = lockReason(markingWindow, selected)

  const handleSave = () => {
    const entries = visibleRoster.map((r) => ({
      enrollmentId: r.enrollmentId,
      present: draft[r.enrollmentId]?.present ?? false,
      note: draft[r.enrollmentId]?.note?.trim() || null,
    }))
    if (entries.length === 0) {
      toast.error('Nema polaznika za spremanje.')
      return
    }
    startTransition(async () => {
      const res = await bulkMarkSession({
        groupId,
        sessionDate: selected,
        entries,
        teacherEntries: toTeacherEntries(teachers, teacherDraft),
      })
      if (res.success) {
        toast.success('Evidencija spremljena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  if (roster.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">Nema upisanih polaznika u ovu grupu.</p>
      </div>
    )
  }

  const hint = scheduleHint(false, dayOfWeek, dateStart, dateEnd, startTime, endTime)
  let sectionTitle: string | null = null
  if (selectedSection === 'other') {
    sectionTitle = 'Ostali termini'
  } else if (selectedSection !== null) {
    sectionTitle = `Modul ${sections[selectedSection].moduleIndex}: ${sections[selectedSection].moduleTitle}`
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Termini</h3>
          {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        </div>

        <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
          {sections.map((s, idx) => {
            const sectionRoster = roster.filter((r) =>
              enrollmentSets[idx].has(r.enrollmentId),
            )
            const datesForSection = [
              ...new Set([...s.expectedSessions, ...s.adhocSessions, ...adhocPerSection[idx]]),
            ].sort((a, b) => a.localeCompare(b))
            return (
              <details
                key={s.moduleId}
                open
                className="group rounded-lg border border-gray-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-900 select-none flex items-center justify-between gap-2">
                  <span className="truncate">
                    Modul {s.moduleIndex}: {s.moduleTitle}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {datesForSection.length}
                  </span>
                </summary>
                <div className="border-t border-gray-100 p-2">
                  {datesForSection.length === 0 ? (
                    <p className="text-xs text-gray-500 px-1 py-1.5">
                      Raspored nije definiran
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {datesForSection.map((key) => (
                        <li key={key}>
                          <DateButton
                            dateKey={key}
                            isActive={key === selected}
                            marked={markedCount(
                              sectionRoster,
                              recordIndex.get(key),
                            )}
                            total={sectionRoster.length}
                            onPick={handlePickDate}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            )
          })}

          {otherDatesAll.length > 0 ? (
            <details
              open
              className="rounded-lg border border-gray-200 bg-white"
            >
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-900 select-none flex items-center justify-between gap-2">
                <span className="truncate">Ostali termini</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {otherDatesAll.length}
                </span>
              </summary>
              <div className="border-t border-gray-100 p-2">
                <ul className="space-y-1">
                  {otherDatesAll.map((key) => (
                    <li key={key}>
                      <DateButton
                        dateKey={key}
                        isActive={key === selected}
                        marked={markedCount(roster, recordIndex.get(key))}
                        total={roster.length}
                        onPick={handlePickDate}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
        </div>

        <AdhocInputBox
          value={newDateInput}
          onChange={setNewDateInput}
          onAdd={handleAddAdhoc}
        />
      </aside>

      <section>
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {sessionLabel(selected)}
              {sectionTitle ? (
                <span className="text-xs font-normal text-gray-500 ml-2">
                  · {sectionTitle}
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-gray-500">
              {locked
                ? 'Evidencija je samo za pregled.'
                : 'Označite prisutnost za svakog polaznika i spremite.'}
            </p>
          </div>
          <SaveButton isPending={isPending} onClick={handleSave} locked={locked} />
        </header>

        <TeacherSection
          teachers={teachers}
          draft={teacherDraft}
          existing={teacherIndex.get(selected)}
          onToggle={toggleTeacher}
          readOnly={locked !== null}
        />

        <RosterTable
          visibleRoster={visibleRoster}
          draft={draft}
          selected={selected}
          recordIndex={recordIndex}
          onToggle={togglePresent}
          onNote={setNote}
          readOnly={locked !== null}
        />
      </section>
    </div>
  )
}
