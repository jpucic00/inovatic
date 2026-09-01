'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Lock, Minus, Pencil, Plus, Save, X } from 'lucide-react'
import { readAdhocDates, writeAdhocDates } from '@/lib/adhoc-date-memory'
import type { MarkingWindow } from '@/lib/attendance-window'
import { DateInput } from '@/components/ui/date-input'
import {
  ConfirmDialog,
  type ConfirmRequest,
} from '@/components/shared/confirm-dialog'
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
import {
  hasUnrecordedEntries,
  initAttendanceDraft,
  initTeacherDraft,
  isSessionDirty,
  sessionStatus,
  summarizeSession,
  type AttendanceDraft,
  type SessionStatus,
  type TeacherDraft,
} from '@/lib/attendance-draft'
import { assignAdhocDateToSection } from '@/lib/attendance-sections'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fromDateKey, todayUtc, toDateKey } from '@/lib/session-dates'

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

function sessionLabel(key: string): string {
  return formatDate(fromDateKey(key))
}

/** How many of the roster already have a row for the date — not how many came. */
function recordedCount(
  roster: AttendanceRosterRow[],
  byEnrollment: Map<string, AttendanceRecord> | undefined,
): number {
  if (!byEnrollment) return 0
  return roster.reduce(
    (n, r) => (byEnrollment.has(r.enrollmentId) ? n + 1 : n),
    0,
  )
}

function makeDraftHandlers(setDraft: Dispatch<SetStateAction<AttendanceDraft>>): {
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

/** Only assigned teachers are bookable; the server enforces the same rule. */
function toTeacherEntries(
  teachers: TeacherAttendanceRow[],
  draft: TeacherDraft,
): { userId: string; present: boolean }[] {
  return teachers
    .filter((t) => t.assigned)
    .map((t) => ({ userId: t.userId, present: draft[t.userId] ?? true }))
}

// ─── Checkbox ───────────────────────────────────────────────────────────────

/**
 * The mark itself. Presentational only — the click target is whatever button
 * wraps it, so a row can be tappable end to end without nesting two controls.
 *
 * Sized 24px on touch and 20px from `sm` up: the pill it replaces was a 26px
 * tall chip that had to be hit precisely, and this is read and tapped a dozen
 * times in a row while a class is starting.
 */
function CheckBox({
  checked,
  disabled,
}: Readonly<{ checked: boolean | 'mixed'; disabled?: boolean }>) {
  const on = checked !== false
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-sm border-2 transition-colors sm:size-5',
        on ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-gray-300 bg-white',
        disabled && 'border-gray-200 bg-gray-100 text-gray-400',
      )}
    >
      {checked === 'mixed' ? (
        <Minus className="size-4 stroke-[3]" />
      ) : null}
      {checked === true ? <Check className="size-4 stroke-[3]" /> : null}
    </span>
  )
}

const CONTROL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1'

// ─── Session status ─────────────────────────────────────────────────────────

const STATUS_TONE = {
  idle: { text: 'text-gray-500', dot: 'bg-gray-300' },
  dirty: { text: 'text-amber-700', dot: 'bg-amber-500' },
  saved: { text: 'text-emerald-700', dot: 'bg-emerald-500' },
} as const

/**
 * Says whether the session is done. Load-bearing: with a blank draft an empty
 * checkbox means "not marked yet" before a save and "odsutan" after one, and
 * nothing else on screen carries that difference.
 */
function StatusLine({ status }: Readonly<{ status: SessionStatus }>) {
  const tone = STATUS_TONE[status.tone]
  // Deliberately not aria-live: the text carries the marked count, so a screen
  // reader would repeat the whole sentence after every single tick, right after
  // the checkbox has already announced its own new state.
  return (
    <p className={cn('flex items-center gap-2 text-xs font-medium', tone.text)}>
      <span className={cn('size-[7px] shrink-0 rounded-full', tone.dot)} />
      {status.text}
    </p>
  )
}

// ─── Mark-all ───────────────────────────────────────────────────────────────

interface MarkAllProps {
  checked: boolean | 'mixed'
  label: string
  onToggle: () => void
  disabled?: boolean
}

function MarkAllButton({ checked, label, onToggle, disabled }: Readonly<MarkAllProps>) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-1 text-left sm:min-h-0 sm:py-1',
        CONTROL_FOCUS,
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <CheckBox checked={checked} disabled={disabled} />
      <span
        className={cn(
          'text-xs font-semibold',
          disabled ? 'text-gray-400' : 'text-cyan-700',
        )}
      >
        {label}
      </span>
    </button>
  )
}

/** none → all, partial → all, all → none. */
function nextAllState(marked: number, total: number): boolean {
  return marked < total
}

function allChecked(marked: number, total: number): boolean | 'mixed' {
  if (total > 0 && marked === total) return true
  if (marked > 0) return 'mixed'
  return false
}

// ─── Teacher section ────────────────────────────────────────────────────────

interface TeacherSectionProps {
  teachers: TeacherAttendanceRow[]
  draft: TeacherDraft
  existing: Map<string, boolean> | undefined
  onToggle: (userId: string) => void
  onToggleAll: () => void
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
  onToggleAll,
  readOnly,
}: Readonly<TeacherSectionProps>) {
  const assigned = teachers.filter((t) => t.assigned)
  const historic = teachers.filter((t) => !t.assigned && existing?.has(t.userId))
  if (assigned.length < 2 && historic.length === 0) return null

  const marked = assigned.filter((t) => draft[t.userId] ?? true).length
  const state = allChecked(marked, assigned.length)

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Nastavnici na terminu
        </h4>
        {assigned.length >= 2 ? (
          <MarkAllButton
            checked={state}
            label={state === true ? 'Poništi sve' : 'Označi sve'}
            onToggle={onToggleAll}
            disabled={readOnly}
          />
        ) : null}
      </div>
      <p className="mb-2.5 text-[11px] text-gray-500">
        Označite tko je stvarno održao ovaj termin — po tome se broje sati.
      </p>
      <div className="flex flex-wrap gap-2">
        {assigned.map((t) => {
          const present = draft[t.userId] ?? true
          return (
            <button
              key={t.userId}
              type="button"
              role="checkbox"
              aria-checked={present}
              onClick={() => onToggle(t.userId)}
              disabled={readOnly}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left transition-colors sm:min-h-0',
                CONTROL_FOCUS,
                present ? 'border-cyan-600 bg-cyan-50' : 'border-gray-200 bg-white',
                readOnly
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:border-gray-300',
              )}
            >
              <CheckBox checked={present} disabled={readOnly} />
              <span className="text-sm font-medium text-gray-900">{t.name}</span>
            </button>
          )
        })}
        {historic.map((t) => (
          <span
            key={t.userId}
            title="Više nije dodijeljen ovoj grupi — evidentirani sati ostaju."
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-500"
          >
            <CheckBox checked={existing?.get(t.userId) ?? false} disabled />
            {t.name}
            <span className="text-[9px] uppercase tracking-wide">bivši</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Roster ─────────────────────────────────────────────────────────────────

interface RosterRowProps {
  row: AttendanceRosterRow
  draft: { present: boolean; note: string }
  existing: AttendanceRecord | undefined
  noteOpen: boolean
  onToggle: () => void
  onToggleNote: () => void
  onNote: (note: string) => void
  readOnly: boolean
}

function RosterRow({
  row,
  draft,
  existing,
  noteOpen,
  onToggle,
  onToggleNote,
  onNote,
  readOnly,
}: Readonly<RosterRowProps>) {
  const name = `${row.lastName} ${row.firstName}`
  // "Odsutan" is only claimed once a row says so AND the draft still agrees —
  // an unticked box the teacher has not saved yet is not an absence, it is an
  // unanswered question.
  const savedAbsent = existing != null && !existing.present && !draft.present
  const noteVisible = noteOpen || draft.note !== ''

  return (
    <li
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center border-t border-gray-100 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_18rem]',
        draft.present && 'bg-cyan-50/40',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={draft.present}
        onClick={onToggle}
        disabled={readOnly}
        className={cn(
          'flex min-h-13 items-center gap-3 px-3 py-2 text-left transition-colors sm:min-h-0 sm:py-3',
          CONTROL_FOCUS,
          readOnly ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50',
        )}
      >
        <CheckBox checked={draft.present} disabled={readOnly} />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm font-medium',
                savedAbsent ? 'text-gray-500' : 'text-gray-900',
              )}
            >
              {name}
            </span>
            {savedAbsent ? (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                Odsutan
              </span>
            ) : null}
          </span>
          {existing?.recordedBy ? (
            <span className="block text-[11px] font-normal text-gray-400" title="Zapisao">
              {existing.recordedBy}
              {existing.recordedByDeleted ? (
                <span className="ml-1 rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-500">
                  Bivši nastavnik
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      {/* Touch only: the note field is the reason the old table scrolled
          sideways on a phone, so it stays folded away until asked for. */}
      <button
        type="button"
        onClick={onToggleNote}
        aria-expanded={noteVisible}
        aria-label={`Bilješka — ${name}`}
        className={cn(
          'mr-2 flex size-11 items-center justify-center rounded-lg sm:hidden',
          CONTROL_FOCUS,
          noteVisible ? 'text-cyan-700' : 'text-gray-300',
        )}
      >
        <Pencil className="size-4" />
      </button>

      <div
        className={cn(
          'col-span-2 px-3 pb-2.5 sm:col-span-1 sm:block sm:px-0 sm:pb-0 sm:pr-3',
          noteVisible ? 'block' : 'hidden',
        )}
      >
        <input
          type="text"
          value={draft.note}
          onChange={(e) => onNote(e.target.value)}
          readOnly={readOnly}
          placeholder={readOnly ? '' : 'npr. opravdano, zakasnio'}
          aria-label={`Bilješka — ${name}`}
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm read-only:bg-gray-50 read-only:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>
    </li>
  )
}

interface RosterListProps {
  visibleRoster: AttendanceRosterRow[]
  draft: AttendanceDraft
  existing: Map<string, AttendanceRecord> | undefined
  marked: number
  onToggle: (enrollmentId: string) => void
  onToggleAll: () => void
  onNote: (enrollmentId: string, note: string) => void
  readOnly: boolean
}

function RosterList({
  visibleRoster,
  draft,
  existing,
  marked,
  onToggle,
  onToggleAll,
  onNote,
  readOnly,
}: Readonly<RosterListProps>) {
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(new Set())
  const toggleNote = (id: string) => {
    setOpenNotes((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  if (visibleRoster.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        Nema polaznika upisanih u odabrani modul.
      </div>
    )
  }

  const total = visibleRoster.length
  const state = allChecked(marked, total)

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <MarkAllButton
          checked={state}
          label={state === true ? 'Poništi sve oznake' : 'Označi sve prisutne'}
          onToggle={onToggleAll}
          disabled={readOnly}
        />
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          {marked} / {total} prisutno
        </span>
      </div>
      <ul aria-label="Polaznici">
        {visibleRoster.map((r) => (
          <RosterRow
            key={r.enrollmentId}
            row={r}
            draft={draft[r.enrollmentId] ?? { present: false, note: '' }}
            existing={existing?.get(r.enrollmentId)}
            noteOpen={openNotes.has(r.enrollmentId)}
            onToggle={() => onToggle(r.enrollmentId)}
            onToggleNote={() => toggleNote(r.enrollmentId)}
            onNote={(note) => onNote(r.enrollmentId, note)}
            readOnly={readOnly}
          />
        ))}
      </ul>
    </div>
  )
}

// ─── Save ───────────────────────────────────────────────────────────────────

function SaveButton({
  isPending,
  onClick,
  locked,
  disabled,
}: Readonly<{
  isPending: boolean
  onClick: () => void
  locked: string | null
  disabled: boolean
}>) {
  // Outside the marking window there is nothing to save, so show the reason
  // instead of a button that would only fail server-side.
  if (locked) {
    return (
      <p className="flex shrink-0 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <Lock className="size-3.5 shrink-0" />
        {locked}
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending || disabled}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:min-h-0',
        CONTROL_FOCUS,
        disabled
          ? 'cursor-not-allowed bg-gray-100 text-gray-400'
          : 'bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60',
      )}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Save className="size-4" />
      )}
      {disabled ? 'Spremljeno' : 'Spremi evidenciju'}
    </button>
  )
}

// ─── Session panel ──────────────────────────────────────────────────────────

interface SessionPanelProps {
  groupId: string
  sessionDate: string
  sectionTitle: string | null
  visibleRoster: AttendanceRosterRow[]
  existing: Map<string, AttendanceRecord> | undefined
  teachers: TeacherAttendanceRow[]
  teacherExisting: Map<string, boolean> | undefined
  markingWindow: MarkingWindow | null
}

/**
 * Everything to the right of the date list, shared by both branches.
 *
 * Mounted with `key={sessionDate}` by its callers, so picking another date
 * remounts it and the drafts initialize from that date's records — the reason
 * there is no reset handler threading four setters around any more.
 */
function SessionPanel({
  groupId,
  sessionDate,
  sectionTitle,
  visibleRoster,
  existing,
  teachers,
  teacherExisting,
  markingWindow,
}: Readonly<SessionPanelProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<AttendanceDraft>(() =>
    initAttendanceDraft(visibleRoster, existing),
  )
  const [teacherDraft, setTeacherDraft] = useState<TeacherDraft>(() =>
    initTeacherDraft(teachers, teacherExisting),
  )
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)

  const { togglePresent, setNote } = makeDraftHandlers(setDraft)
  const locked = lockReason(markingWindow, sessionDate)
  const readOnly = locked !== null

  const total = visibleRoster.length
  const marked = visibleRoster.filter((r) => draft[r.enrollmentId]?.present).length
  const summary = summarizeSession(visibleRoster, existing)
  const dirty = isSessionDirty({
    roster: visibleRoster,
    draft,
    existing,
    teacherDraft,
    teacherExisting,
  })
  const status = sessionStatus({
    dirty,
    marked,
    total,
    summary,
    formatSavedAt: (iso) => formatDateTime(new Date(iso)),
  })

  const toggleAll = () => {
    const present = nextAllState(marked, total)
    setDraft((prev) => {
      const next: AttendanceDraft = { ...prev }
      for (const r of visibleRoster) {
        next[r.enrollmentId] = {
          present,
          note: prev[r.enrollmentId]?.note ?? '',
        }
      }
      return next
    })
  }

  const assignedTeachers = teachers.filter((t) => t.assigned)
  const toggleAllTeachers = () => {
    const on = assignedTeachers.filter((t) => teacherDraft[t.userId] ?? true).length
    const present = nextAllState(on, assignedTeachers.length)
    const next: TeacherDraft = {}
    for (const t of assignedTeachers) next[t.userId] = present
    setTeacherDraft(next)
  }

  const runSave = () => {
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
        sessionDate,
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

  /**
   * A blank draft made "save" reachable with nothing ticked, which would write
   * the whole roster absent in one click — so that one case asks first, the
   * same way every paid mark does. Red only when it would overwrite marks that
   * already exist; a first record is bookkeeping, not an erasure.
   */
  const handleSave = () => {
    // `total === 0` is a module nobody is enrolled in, not a class nobody
    // attended — asking "spremiti bez ijednog prisutnog?" about an empty list
    // would be nonsense, so let runSave say what is actually wrong.
    if (marked > 0 || total === 0) {
      runSave()
      return
    }
    setConfirmRequest({
      title: 'Spremiti bez ijednog prisutnog?',
      description:
        'Nitko nije označen kao prisutan, pa se svi polaznici na popisu evidentiraju kao odsutni.',
      context: [sessionLabel(sessionDate), sectionTitle].filter(Boolean).join(' · '),
      confirmLabel: 'Evidentiraj kao odsutne',
      destructive: summary.recorded > 0,
      onConfirm: runSave,
    })
  }

  // A clean draft disables Save only when the saved rows cover EVERYONE.
  // Nothing-recorded stays saveable (a session nobody attended must be
  // writable), and so does a partial record: a student enrolled — or a teacher
  // assigned — after the session was saved has no row, rests at the draft
  // baseline, and can never look like an edit; this save is the only way that
  // missing row gets written.
  const saveDisabled =
    !dirty &&
    summary.recorded > 0 &&
    !hasUnrecordedEntries({
      roster: visibleRoster,
      existing,
      teachers,
      teacherExisting,
    })

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {sessionLabel(sessionDate)}
            {sectionTitle ? (
              <span className="ml-2 text-xs font-normal text-gray-500">
                · {sectionTitle}
              </span>
            ) : null}
          </h3>
          <div className="mt-1">
            <StatusLine status={status} />
          </div>
        </div>
        <SaveButton
          isPending={isPending}
          onClick={handleSave}
          locked={locked}
          disabled={saveDisabled}
        />
      </header>

      <TeacherSection
        teachers={teachers}
        draft={teacherDraft}
        existing={teacherExisting}
        onToggle={(userId) =>
          setTeacherDraft((prev) => ({ ...prev, [userId]: !(prev[userId] ?? true) }))
        }
        onToggleAll={toggleAllTeachers}
        readOnly={readOnly}
      />

      <RosterList
        visibleRoster={visibleRoster}
        draft={draft}
        existing={existing}
        marked={marked}
        onToggle={togglePresent}
        onToggleAll={toggleAll}
        onNote={setNote}
        readOnly={readOnly}
      />

      <ConfirmDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
    </section>
  )
}

// ─── Date list ──────────────────────────────────────────────────────────────

interface DateButtonProps {
  dateKey: string
  isActive: boolean
  recorded: number
  total: number
  onPick: (key: string) => void
  /**
   * Present only on a hand-added date with no saved rows yet — the × that
   * takes a typo back out of the per-tab memory. A date the server lists, or
   * one evidencija was saved for, is not removable from here.
   */
  onRemove?: () => void
}

function DateButton({
  dateKey,
  isActive,
  recorded,
  total,
  onPick,
  onRemove,
}: Readonly<DateButtonProps>) {
  const isFuture = dateKey > toDateKey(todayUtc())
  let chipClass = 'bg-gray-100 text-gray-500'
  if (total > 0 && recorded === total) chipClass = 'bg-emerald-100 text-emerald-700'
  else if (recorded > 0) chipClass = 'bg-amber-100 text-amber-700'
  // A sibling, never a child: a remove button nested inside the pick button
  // would be interactive-inside-interactive — the same invalid-HTML trap the
  // roster checkboxes design around.
  const pickButton = (
    <button
      type="button"
      onClick={() => onPick(dateKey)}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors sm:min-h-0',
        CONTROL_FOCUS,
        isActive
          ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
          : 'border-gray-200 bg-white hover:border-gray-300',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{sessionLabel(dateKey)}</span>
        {isFuture ? (
          <span className="block text-[11px] text-gray-400">nadolazeći</span>
        ) : null}
      </span>
      {/* "0/8" read as "nobody came" rather than "not recorded" — the em dash
          is the only value here that cannot be misread as attendance. */}
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
          chipClass,
        )}
        title={recorded === 0 ? 'Nije evidentirano' : 'Evidentirano zapisa'}
      >
        {recorded === 0 ? '—' : `${recorded}/${total}`}
      </span>
    </button>
  )

  if (!onRemove) return pickButton

  return (
    <div className="flex items-stretch gap-1">
      <div className="min-w-0 flex-1">{pickButton}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Ukloni ručno dodani datum ${sessionLabel(dateKey)}`}
        title="Ukloni ručno dodani datum"
        className={cn(
          'flex w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:text-red-600',
          CONTROL_FOCUS,
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
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
      <label htmlFor="adhoc-date" className="mb-1.5 block text-xs font-medium text-gray-600">
        Dodaj datum ručno
      </label>
      <div className="flex gap-2">
        <DateInput
          id="adhoc-date"
          value={value}
          onChange={onChange}
          className="w-full min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!value}
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50',
            CONTROL_FOCUS,
          )}
        >
          <Plus className="size-3.5" />
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

/**
 * Radionica groups read as a date range ("15.07. – 21.07. · 10:00–13:00");
 * every weekly group — standard or competition — reads as its weekday.
 */
function scheduleHint(
  dateRange: boolean,
  dayOfWeek: string | null,
  dateStart: string | null,
  dateEnd: string | null,
  startTime: string | null,
  endTime: string | null,
): string | null {
  const endSuffix = endTime ? `–${endTime}` : ''
  const timeRange = startTime ? ` · ${startTime}${endSuffix}` : ''
  if (dateRange && dateStart && dateEnd) {
    const rangeLabel =
      dateStart === dateEnd
        ? formatDate(fromDateKey(dateStart))
        : `${formatDate(fromDateKey(dateStart))} – ${formatDate(fromDateKey(dateEnd))}`
    return `${rangeLabel}${timeRange}`
  }
  if (dayOfWeek) return `${dayOfWeek}${timeRange}`
  return null
}

/**
 * Hand-added dates, remembered per group in sessionStorage (see
 * `src/lib/adhoc-date-memory.ts`) so switching to another group tab or
 * reloading does not silently drop an unsaved termin. Loaded in an effect, not
 * the state initializer — the marker is server-rendered, and reading
 * sessionStorage during hydration would mismatch. `serverKnown` must be
 * referentially stable (memoized): it both prunes dates that gained real
 * attendance rows and re-syncs the memory after a save refreshes the props.
 */
function useAdhocDates(
  groupId: string,
  serverKnown: readonly string[],
): [string[], (key: string) => void, (key: string) => void] {
  const [adhocDates, setAdhocDates] = useState<string[]>([])

  useEffect(() => {
    setAdhocDates(readAdhocDates(groupId, new Set(serverKnown)))
  }, [groupId, serverKnown])

  const addAdhocDate = useCallback(
    (key: string) => {
      setAdhocDates((prev) => {
        if (prev.includes(key)) return prev
        const next = [...prev, key]
        // Write-through inside the updater keeps memory and list in lockstep;
        // a strict-mode double invoke just rewrites the same value.
        writeAdhocDates(groupId, next)
        return next
      })
    },
    [groupId],
  )

  // The deliberate delete path for a mistyped date. Adding the memory
  // (2026-08-22) removed the accidental one — navigating away used to discard
  // the draft — so without this a typo sat in the list for the tab's lifetime.
  const removeAdhocDate = useCallback(
    (key: string) => {
      setAdhocDates((prev) => {
        if (!prev.includes(key)) return prev
        const next = prev.filter((d) => d !== key)
        writeAdhocDates(groupId, next)
        return next
      })
    },
    [groupId],
  )

  return [adhocDates, addAdhocDate, removeAdhocDate]
}

/** Shared by both branches: validate a hand-typed date and select it. */
function useAdhocInput(
  allDates: readonly string[],
  addAdhocDate: (key: string) => void,
  pick: (key: string) => void,
): { value: string; setValue: (v: string) => void; add: () => void } {
  const [value, setValue] = useState('')
  const add = () => {
    if (!value) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toast.error('Neispravan datum.')
      return
    }
    if (!allDates.includes(value)) addAdhocDate(value)
    pick(value)
    setValue('')
  }
  return { value, setValue, add }
}

function EmptyRoster() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-gray-500">Nema upisanih polaznika u ovu grupu.</p>
    </div>
  )
}

// ─── Public component ───────────────────────────────────────────────────────

export function AttendanceMarker(props: Readonly<GroupAttendance>) {
  // Radionica and competition groups share the flat marker: both are a plain
  // list of dates with no module sections to slice.
  if (props.kind === 'standard') return <StandardAttendanceMarker {...props} />
  return <FlatAttendanceMarker {...props} />
}

// ─── Flat branch (radionica + competition season) ───────────────────────────

type FlatProps = Extract<GroupAttendance, { kind: 'custom' | 'season' }>

function pickFlatDefault(expected: string[], extras: string[]): string {
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

function FlatAttendanceMarker({
  groupId,
  kind,
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
}: Readonly<FlatProps>) {
  const recordIndex = useMemo(() => indexRecords(records), [records])
  const teacherIndex = useMemo(
    () => indexTeacherRecords(teacherRecords),
    [teacherRecords],
  )
  const serverKnown = useMemo(
    () => [...expectedSessions, ...extraSessions],
    [expectedSessions, extraSessions],
  )
  const [adhocDates, addAdhocDate, removeAdhocDate] = useAdhocDates(groupId, serverKnown)
  const allDates = useMemo(() => {
    const merged = [...new Set([...serverKnown, ...adhocDates])]
    merged.sort((a, b) => a.localeCompare(b))
    return merged
  }, [serverKnown, adhocDates])

  const [selected, setSelected] = useState<string>(() =>
    pickFlatDefault(expectedSessions, extraSessions),
  )
  const adhocInput = useAdhocInput(allDates, addAdhocDate, setSelected)

  // Removing the date under the open panel would leave it showing a session
  // the list no longer offers — fall back to the branch default instead.
  const handleRemoveAdhoc = (key: string) => {
    removeAdhocDate(key)
    if (selected === key) setSelected(pickFlatDefault(expectedSessions, extraSessions))
  }

  if (roster.length === 0) return <EmptyRoster />

  const hint = scheduleHint(kind === 'custom', dayOfWeek, dateStart, dateEnd, startTime, endTime)

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-3">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Termini</h3>
          {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        </div>

        {allDates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-xs text-gray-500">
            Nema definiranih datuma za ovu radionicu. Dodajte termin ručno ispod.
          </p>
        ) : (
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {allDates.map((key) => {
              const recorded = recordedCount(roster, recordIndex.get(key))
              return (
                <li key={key}>
                  <DateButton
                    dateKey={key}
                    isActive={key === selected}
                    recorded={recorded}
                    total={roster.length}
                    onPick={setSelected}
                    onRemove={
                      adhocDates.includes(key) && recorded === 0
                        ? () => handleRemoveAdhoc(key)
                        : undefined
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}

        <AdhocInputBox
          value={adhocInput.value}
          onChange={adhocInput.setValue}
          onAdd={adhocInput.add}
        />
      </aside>

      <SessionPanel
        key={selected}
        groupId={groupId}
        sessionDate={selected}
        sectionTitle={null}
        visibleRoster={roster}
        existing={recordIndex.get(selected)}
        teachers={teachers}
        teacherExisting={teacherIndex.get(selected)}
        markingWindow={markingWindow}
      />
    </div>
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

function sectionTitleFor(
  selectedSection: SectionKey | null,
  sections: AttendanceModuleSection[],
): string | null {
  if (selectedSection === 'other') return 'Ostali termini'
  if (selectedSection === null) return null
  const s = sections[selectedSection]
  return `Modul ${s.moduleIndex}: ${s.moduleTitle}`
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
  const recordIndex = useMemo(() => indexRecords(records), [records])
  const teacherIndex = useMemo(
    () => indexTeacherRecords(teacherRecords),
    [teacherRecords],
  )

  const [selected, setSelected] = useState<string>(defaultSelectedDate)
  const serverKnown = useMemo(
    () => [
      ...sections.flatMap((s) => [...s.expectedSessions, ...s.adhocSessions]),
      ...otherDates,
    ],
    [sections, otherDates],
  )
  const [adhocDates, addAdhocDate, removeAdhocDate] = useAdhocDates(groupId, serverKnown)

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

  const allKnownDates = useMemo(
    () => [...serverKnown, ...adhocDates],
    [serverKnown, adhocDates],
  )
  const adhocInput = useAdhocInput(allKnownDates, addAdhocDate, setSelected)

  // Removing the date under the open panel would leave it showing a session
  // the list no longer offers — fall back to the branch default instead.
  const handleRemoveAdhoc = (key: string) => {
    removeAdhocDate(key)
    if (selected === key) setSelected(defaultSelectedDate)
  }

  if (roster.length === 0) return <EmptyRoster />

  const hint = scheduleHint(false, dayOfWeek, dateStart, dateEnd, startTime, endTime)

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-3">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Termini</h3>
          {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
        </div>

        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
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
                <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-gray-900">
                  <span className="truncate">
                    Modul {s.moduleIndex}: {s.moduleTitle}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {datesForSection.length}
                  </span>
                </summary>
                <div className="border-t border-gray-100 p-2">
                  {datesForSection.length === 0 ? (
                    <p className="px-1 py-1.5 text-xs text-gray-500">
                      Raspored nije definiran
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {datesForSection.map((key) => {
                        const recorded = recordedCount(
                          sectionRoster,
                          recordIndex.get(key),
                        )
                        return (
                          <li key={key}>
                            <DateButton
                              dateKey={key}
                              isActive={key === selected}
                              recorded={recorded}
                              total={sectionRoster.length}
                              onPick={setSelected}
                              onRemove={
                                adhocDates.includes(key) && recorded === 0
                                  ? () => handleRemoveAdhoc(key)
                                  : undefined
                              }
                            />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </details>
            )
          })}

          {otherDatesAll.length > 0 ? (
            <details open className="rounded-lg border border-gray-200 bg-white">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-gray-900">
                <span className="truncate">Ostali termini</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {otherDatesAll.length}
                </span>
              </summary>
              <div className="border-t border-gray-100 p-2">
                <ul className="space-y-1">
                  {otherDatesAll.map((key) => {
                    const recorded = recordedCount(roster, recordIndex.get(key))
                    return (
                      <li key={key}>
                        <DateButton
                          dateKey={key}
                          isActive={key === selected}
                          recorded={recorded}
                          total={roster.length}
                          onPick={setSelected}
                          onRemove={
                            adhocDates.includes(key) && recorded === 0
                              ? () => handleRemoveAdhoc(key)
                              : undefined
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            </details>
          ) : null}
        </div>

        <AdhocInputBox
          value={adhocInput.value}
          onChange={adhocInput.setValue}
          onAdd={adhocInput.add}
        />
      </aside>

      <SessionPanel
        key={selected}
        groupId={groupId}
        sessionDate={selected}
        sectionTitle={sectionTitleFor(selectedSection, sections)}
        visibleRoster={visibleRoster}
        existing={recordIndex.get(selected)}
        teachers={teachers}
        teacherExisting={teacherIndex.get(selected)}
        markingWindow={markingWindow}
      />
    </div>
  )
}
