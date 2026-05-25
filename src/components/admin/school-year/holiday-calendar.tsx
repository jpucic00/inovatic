'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/format'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import type { ModuleMarker, WorkshopLabel } from '@/lib/school-year-planner'
import {
  upsertHoliday,
  upsertHolidayRange,
  removeHoliday,
  removeHolidayRange,
  type HolidayRow,
} from '@/actions/admin/holidays'

type Props = {
  schoolYear: string // "YYYY/YYYY"
  archived: boolean
  holidays: HolidayRow[]
  /**
   * Per-weekday list of YYYY-MM-DD keys that paint as session cells. Caller
   * caps each list at 28 (STANDARD_PROGRAM_SESSION_TARGET) so sessions beyond
   * the curriculum target stay unpainted even when admin module windows are
   * over-long.
   */
  sessionDatesByWeekday: Record<string, ReadonlyArray<string>>
  /** YYYY-MM-DD of the 28th (last) session per weekday — gets a ring marker. */
  lastSessionDateByWeekday: Record<string, string | null>
  moduleMarkers: ModuleMarker[]
  /** Per-day radionica (workshop) Course.title labels — empty when no workshops are scheduled. */
  workshopLabels?: WorkshopLabel[]
}

type CellState = {
  date: Date // UTC midnight
  key: string // YYYY-MM-DD
  weekday: number // 0=Sun..6=Sat
  weekdayName: string // Croatian
  inMonth: boolean
  isToday: boolean
  /** True when this cell's date is in the per-weekday session list (≤28). */
  isSessionDate: boolean
  /** True when this cell is the 28th session for its weekday. */
  isLastSessionDate: boolean
  holiday: HolidayRow | null
  markers: ModuleMarker[]
  workshops: string[] // course titles for any radionica covering this day
}

/**
 * Open dialog state. `startKey === endKey` means single-day; otherwise the
 * dialog spans the inclusive range. `existingHoliday` is set when editing
 * (single-day path only — ranges always create new entries). `blockStart`/
 * `blockEnd` mark the contiguous holiday run the cell belongs to, used to
 * surface the "Ukloni cijeli raspon" option when block size > 1.
 */
type DialogState = {
  startKey: string
  endKey: string
  startDate: Date
  endDate: Date
  existingHoliday: HolidayRow | null
  markers: ModuleMarker[]
  blockStart: string | null
  blockEnd: string | null
}

const WEEKDAY_LABELS_HEADER = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'] as const
const WEEKDAY_INDEX_TO_NAME = [
  'Nedjelja',
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d))
}

function todayUtcMidnight(): Date {
  const now = new Date()
  return utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

/** Inclusive day count between two YYYY-MM-DD keys. */
function dayCount(startKey: string, endKey: string): number {
  const start = fromDateKey(startKey).getTime()
  const end = fromDateKey(endKey).getTime()
  return Math.floor((end - start) / 86_400_000) + 1
}

/** YYYY-MM-DD shifted by `delta` days. */
function shiftDateKey(key: string, delta: number): string {
  return toDateKey(new Date(fromDateKey(key).getTime() + delta * 86_400_000))
}

/**
 * Walk left and right from `cellKey` through the contiguous run of holidays
 * present in `holidayKeys`. Returns the inclusive bounds. If the cell isn't
 * itself a holiday, returns null.
 */
function findHolidayBlock(
  cellKey: string,
  holidayKeys: ReadonlySet<string>,
): { start: string; end: string } | null {
  if (!holidayKeys.has(cellKey)) return null
  let start = cellKey
  let end = cellKey
  while (true) {
    const prev = shiftDateKey(start, -1)
    if (!holidayKeys.has(prev)) break
    start = prev
  }
  while (true) {
    const next = shiftDateKey(end, 1)
    if (!holidayKeys.has(next)) break
    end = next
  }
  return { start, end }
}

/** Returns the 12 months Sept(yearStart) → Aug(yearStart+1). */
function monthsForSchoolYear(schoolYear: string): Array<{ year: number; month: number; label: string }> {
  const startYear = Number.parseInt(schoolYear.split('/')[0], 10)
  const out: Array<{ year: number; month: number; label: string }> = []
  for (let i = 0; i < 12; i++) {
    const m = (8 + i) % 12 // Sept = 8
    const y = startYear + (8 + i >= 12 ? 1 : 0)
    const label = new Intl.DateTimeFormat('hr-HR', { month: 'long', year: 'numeric' }).format(
      utcMidnight(y, m, 1),
    )
    out.push({ year: y, month: m, label })
  }
  return out
}

/**
 * Builds the 6-row × 7-col cell grid for a month, padded with the trailing
 * days of the previous month + leading days of the next month so the first
 * cell always lines up with Monday.
 */
function buildMonthGrid(
  year: number,
  month: number,
  ctx: {
    today: Date
    sessionDateSet: Set<string>
    lastSessionDateSet: Set<string>
    holidaysByDate: Map<string, HolidayRow>
    markersByDate: Map<string, ModuleMarker[]>
    workshopsByDate: Map<string, string[]>
  },
): CellState[] {
  const firstOfMonth = utcMidnight(year, month, 1)
  // Monday-first: shift JS Sunday(0)→6, Monday(1)→0, ...
  const leading = (firstOfMonth.getUTCDay() + 6) % 7
  const start = new Date(firstOfMonth.getTime() - leading * 86_400_000)

  const cells: CellState[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const key = toDateKey(d)
    const weekday = d.getUTCDay()
    const weekdayName = WEEKDAY_INDEX_TO_NAME[weekday]
    cells.push({
      date: d,
      key,
      weekday,
      weekdayName,
      inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year,
      isToday: d.getTime() === ctx.today.getTime(),
      isSessionDate: ctx.sessionDateSet.has(key),
      isLastSessionDate: ctx.lastSessionDateSet.has(key),
      holiday: ctx.holidaysByDate.get(key) ?? null,
      markers: ctx.markersByDate.get(key) ?? [],
      workshops: ctx.workshopsByDate.get(key) ?? [],
    })
  }
  return cells
}

export function HolidayCalendar({
  schoolYear,
  archived,
  holidays,
  sessionDatesByWeekday,
  lastSessionDateByWeekday,
  moduleMarkers,
  workshopLabels = [],
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<DialogState | null>(null)
  const [name, setName] = useState('')
  const [attendanceConflict, setAttendanceConflict] = useState<number | null>(null)
  // Cell key staged as the start of a range — set on first single click,
  // consumed by the second click on a different empty cell.
  const [rangeStart, setRangeStart] = useState<string | null>(null)

  const months = useMemo(() => monthsForSchoolYear(schoolYear), [schoolYear])

  const holidaysByDate = useMemo(
    () => new Map(holidays.map((h) => [h.date, h])),
    [holidays],
  )
  const markersByDate = useMemo(() => {
    const m = new Map<string, ModuleMarker[]>()
    for (const marker of moduleMarkers) {
      const arr = m.get(marker.date) ?? []
      arr.push(marker)
      m.set(marker.date, arr)
    }
    return m
  }, [moduleMarkers])
  const workshopsByDate = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const w of workshopLabels) {
      const arr = m.get(w.date) ?? []
      arr.push(w.title)
      m.set(w.date, arr)
    }
    return m
  }, [workshopLabels])
  const sessionDateSet = useMemo(() => {
    const s = new Set<string>()
    for (const keys of Object.values(sessionDatesByWeekday)) {
      for (const k of keys) s.add(k)
    }
    return s
  }, [sessionDatesByWeekday])
  const lastSessionDateSet = useMemo(() => {
    const s = new Set<string>()
    for (const k of Object.values(lastSessionDateByWeekday)) {
      if (k) s.add(k)
    }
    return s
  }, [lastSessionDateByWeekday])
  const today = useMemo(todayUtcMidnight, [])

  const isRange = editing !== null && editing.startKey !== editing.endKey

  function openSingle(cell: CellState) {
    setRangeStart(null)
    const holidayKeys = new Set(holidaysByDate.keys())
    const block = findHolidayBlock(cell.key, holidayKeys)
    setEditing({
      startKey: cell.key,
      endKey: cell.key,
      startDate: cell.date,
      endDate: cell.date,
      existingHoliday: cell.holiday,
      markers: cell.markers,
      blockStart: block?.start ?? null,
      blockEnd: block?.end ?? null,
    })
    setName(cell.holiday?.name ?? '')
    setAttendanceConflict(null)
  }

  function openRange(a: CellState, b: CellState) {
    setRangeStart(null)
    const [start, end] = a.key < b.key ? [a, b] : [b, a]
    setEditing({
      startKey: start.key,
      endKey: end.key,
      startDate: start.date,
      endDate: end.date,
      existingHoliday: null,
      markers: [],
      blockStart: null,
      blockEnd: null,
    })
    setName('')
    setAttendanceConflict(null)
  }

  function handleCellClick(cell: CellState, cellsByKey: Map<string, CellState>) {
    if (archived) return
    // Clicking an existing holiday always opens the edit dialog and drops
    // any pending range start — keeps editing flow predictable.
    if (cell.holiday) {
      openSingle(cell)
      return
    }
    // No range pending yet → stage this cell as start.
    if (rangeStart === null) {
      setRangeStart(cell.key)
      return
    }
    // Clicking the staged cell again commits as single-day (also makes the
    // double-click shortcut work — the browser fires two clicks before
    // dblclick, so the second click lands here and opens the dialog).
    if (rangeStart === cell.key) {
      openSingle(cell)
      return
    }
    // Different empty cell → commit the range.
    const startCell = cellsByKey.get(rangeStart)
    if (!startCell) {
      // Range start belonged to a different month rendering pass — fall back
      // to a single-day open on the current cell so the user isn't stuck.
      openSingle(cell)
      return
    }
    openRange(startCell, cell)
  }

  function handleCellDoubleClick(cell: CellState) {
    if (archived) return
    openSingle(cell)
  }

  function closeDialog() {
    if (isPending) return
    setEditing(null)
    setAttendanceConflict(null)
    setName('')
  }

  function handleSave(confirmDelete = false) {
    if (!editing) return
    startTransition(async () => {
      const payload = { schoolYear, name: name.trim() || undefined, confirmDeleteAttendance: confirmDelete }
      const res = isRange
        ? await upsertHolidayRange({ ...payload, startDate: editing.startKey, endDate: editing.endKey })
        : await upsertHoliday({ ...payload, date: editing.startKey })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      if (res.requiresConfirmation) {
        setAttendanceConflict(res.attendanceCount)
        return
      }
      const startLabel = formatDate(editing.startDate)
      const successMsg = isRange
        ? `Spremljeno ${dayCount(editing.startKey, editing.endKey)} praznika (${startLabel} – ${formatDate(editing.endDate)}).`
        : `Praznik ${startLabel} spremljen.`
      toast.success(successMsg)
      closeDialog()
      router.refresh()
    })
  }

  function handleRemove() {
    if (!editing?.existingHoliday) return
    startTransition(async () => {
      const res = await removeHoliday({ id: editing.existingHoliday!.id })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`Praznik ${formatDate(editing.startDate)} uklonjen.`)
      closeDialog()
      router.refresh()
    })
  }

  function handleRemoveBlock() {
    if (!editing?.blockStart || !editing.blockEnd) return
    const startKey = editing.blockStart
    const endKey = editing.blockEnd
    startTransition(async () => {
      const res = await removeHolidayRange({ schoolYear, startDate: startKey, endDate: endKey })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const n = dayCount(startKey, endKey)
      toast.success(
        `Uklonjeno ${n} praznika (${formatDate(fromDateKey(startKey))} – ${formatDate(fromDateKey(endKey))}).`,
      )
      closeDialog()
      router.refresh()
    })
  }

  // Pre-compute the staged start's display label for the hint banner —
  // the rangeStart cell may live in any of the 12 month grids.
  const rangeStartDate = rangeStart ? fromDateKey(rangeStart) : null

  const gridCtx = {
    today,
    sessionDateSet,
    lastSessionDateSet,
    holidaysByDate,
    markersByDate,
    workshopsByDate,
  }

  return (
    <>
      {rangeStart && rangeStartDate && !archived && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm text-cyan-900">
          <span>
            Početak raspona: <strong>{formatDate(rangeStartDate)}</strong>. Kliknite još jedan
            dan za raspon ili dvoklik za samo ovaj dan.
          </span>
          <button
            type="button"
            onClick={() => setRangeStart(null)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-100"
          >
            <X className="h-3.5 w-3.5" />
            Odustani
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {months.map(({ year, month, label }) => {
          const cells = buildMonthGrid(year, month, gridCtx)
          // Lookup so range-commit can resolve a key into a cell regardless
          // of which month grid the user originally clicked in.
          const cellsByKey = new Map(cells.filter((c) => c.inMonth).map((c) => [c.key, c]))
          return (
            <section
              key={`${year}-${month}`}
              className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs"
            >
              <h3 className="mb-2 text-sm font-semibold capitalize text-gray-900">{label}</h3>
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAY_LABELS_HEADER.map((label) => (
                  <div
                    key={label}
                    className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-gray-500"
                  >
                    {label}
                  </div>
                ))}
                {cells.map((cell) => (
                  <DayCell
                    key={cell.key}
                    cell={cell}
                    disabled={archived}
                    isRangeStart={rangeStart === cell.key && cell.inMonth}
                    onClick={() => handleCellClick(cell, cellsByKey)}
                    onDoubleClick={() => handleCellDoubleClick(cell)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <CalendarLegend />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.existingHoliday
                ? `Praznik — ${formatDate(editing.startDate, 'long')}`
                : isRange && editing
                  ? `Označi raspon — ${formatDate(editing.startDate)} – ${formatDate(editing.endDate)} (${dayCount(editing.startKey, editing.endKey)} dana)`
                  : editing
                    ? `Označi kao praznik — ${formatDate(editing.startDate, 'long')}`
                    : ''}
            </DialogTitle>
            <DialogDescription>
              {archived
                ? 'Pregled arhivirane školske godine — izmjene nisu dozvoljene.'
                : isRange
                  ? 'Svi dani u rasponu bit će označeni kao praznik i izuzeti iz evidencije dolaska.'
                  : 'Dani označeni kao praznik nisu uključeni u evidenciju dolaska.'}
            </DialogDescription>
          </DialogHeader>

          {editing?.existingHoliday &&
            editing.blockStart &&
            editing.blockEnd &&
            editing.blockStart !== editing.blockEnd && (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Dio raspona{' '}
                <strong>
                  {formatDate(fromDateKey(editing.blockStart))} –{' '}
                  {formatDate(fromDateKey(editing.blockEnd))}
                </strong>{' '}
                ({dayCount(editing.blockStart, editing.blockEnd)} uzastopnih praznika).
              </div>
            )}

          {editing && editing.markers.length > 0 && (
            <ul className="space-y-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {editing.markers.map((m, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  {m.kind === 'start' ? (
                    <ArrowUpFromLine className="h-3 w-3 text-emerald-600" aria-hidden />
                  ) : (
                    <ArrowDownToLine className="h-3 w-3 text-orange-600" aria-hidden />
                  )}
                  {m.tooltip}
                </li>
              ))}
            </ul>
          )}

          {!archived && (
            <div className="space-y-2">
              <label htmlFor="holiday-name" className="text-sm font-medium text-gray-800">
                Naziv (neobavezno)
              </label>
              <Input
                id="holiday-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Npr. Sv. Duje, Božić, Sveta tri kralja…"
                maxLength={100}
                disabled={isPending}
              />
            </div>
          )}

          {attendanceConflict !== null && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Postoji <strong>{attendanceConflict}</strong>{' '}
              {attendanceConflict === 1 ? 'zapis' : 'zapisa'} dolaska
              {isRange ? ' u rasponu' : ' na ovaj dan'}. Spremanjem će biti obrisani.
            </div>
          )}

          <DialogFooter className="sm:flex-wrap">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
              {editing?.existingHoliday && !archived && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {editing.blockStart && editing.blockEnd && editing.blockStart !== editing.blockEnd
                    ? 'Ukloni samo ovaj dan'
                    : 'Ukloni praznik'}
                </Button>
              )}
              {editing?.existingHoliday &&
                !archived &&
                editing.blockStart &&
                editing.blockEnd &&
                editing.blockStart !== editing.blockEnd && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveBlock}
                    disabled={isPending}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Ukloni raspon ({dayCount(editing.blockStart, editing.blockEnd)})
                  </Button>
                )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>
                Odustani
              </Button>
              {!archived && (
                <Button
                  type="button"
                  variant={attendanceConflict !== null ? 'destructive' : 'default'}
                  onClick={() => handleSave(attendanceConflict !== null)}
                  disabled={isPending}
                >
                  {attendanceConflict !== null
                    ? 'Da, obriši dolaske i spremi'
                    : editing?.existingHoliday
                      ? 'Ažuriraj'
                      : isRange
                        ? 'Spremi raspon'
                        : 'Spremi'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DayCell({
  cell,
  disabled,
  isRangeStart,
  onClick,
  onDoubleClick,
}: Readonly<{
  cell: CellState
  disabled: boolean
  isRangeStart: boolean
  onClick: () => void
  onDoubleClick: () => void
}>) {
  const { inMonth, isToday, isSessionDate, isLastSessionDate, holiday, markers, workshops, date, weekday } = cell

  // Dedupe start/end markers by moduleIndex — multiple courses already merge
  // upstream, but a cell can still receive several markers from custom radionice.
  const startBadges = uniqByIndex(markers.filter((m) => m.kind === 'start'))
  const endBadges = uniqByIndex(markers.filter((m) => m.kind === 'end'))
  const showLastRing = isLastSessionDate && inMonth && !holiday
  const hasWorkshops = inMonth && workshops.length > 0

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled && !holiday && markers.length === 0}
      data-date={cell.key}
      data-holiday={holiday ? 'true' : 'false'}
      data-in-month={inMonth ? 'true' : 'false'}
      data-range-start={isRangeStart ? 'true' : 'false'}
      data-session={isSessionDate ? 'true' : 'false'}
      data-last-session={isLastSessionDate ? 'true' : 'false'}
      title={[
        holiday ? `Praznik${holiday.name ? `: ${holiday.name}` : ''}` : '',
        showLastRing ? 'Zadnja radionica (28. po redu)' : '',
        ...workshops.map((w) => `Radionica: ${w}`),
        ...markers.map((m) => m.tooltip),
      ]
        .filter(Boolean)
        .join('\n') || undefined}
      className={cn(
        'relative h-20 rounded-md border p-1 text-left text-xs transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500',
        !inMonth && 'border-transparent bg-transparent text-gray-300',
        inMonth && !holiday && !isSessionDate && !hasWorkshops && 'border-gray-100 bg-white text-gray-600 hover:bg-gray-50',
        inMonth && !holiday && !isSessionDate && hasWorkshops && 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100',
        inMonth && !holiday && isSessionDate && 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
        inMonth && holiday && 'border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200',
        showLastRing && 'ring-2 ring-inset ring-emerald-700',
        isToday && inMonth && !isRangeStart && 'ring-2 ring-cyan-500',
        isRangeStart && 'ring-2 ring-cyan-600 ring-offset-1',
        weekday === 0 && inMonth && !holiday && !hasWorkshops && 'text-gray-400',
        disabled && 'cursor-default',
      )}
      aria-label={`${date.getUTCDate()}. ${date.getUTCMonth() + 1}. ${date.getUTCFullYear()}${holiday ? ' — praznik' : ''}${showLastRing ? ' — zadnja radionica' : ''}${isRangeStart ? ' — početak raspona' : ''}`}
    >
      <span className="text-[11px] font-semibold leading-none">
        {date.getUTCDate()}
      </span>

      {inMonth && (startBadges.length > 0 || endBadges.length > 0 || showLastRing) && (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {startBadges.map((m) => (
            <ModuleBadge key={`s-${m.moduleIndex}`} kind="start" moduleIndex={m.moduleIndex} />
          ))}
          {endBadges.map((m) => (
            <ModuleBadge key={`e-${m.moduleIndex}`} kind="end" moduleIndex={m.moduleIndex} />
          ))}
          {showLastRing && (
            <span
              className="inline-flex items-center rounded-sm border border-emerald-700 bg-white px-1 py-px text-[9px] font-semibold leading-none text-emerald-900"
              aria-label="Zadnja radionica (28.)"
            >
              28.
            </span>
          )}
        </div>
      )}

      {hasWorkshops && (
        <div
          className={cn(
            'absolute inset-x-1 bottom-0.5 space-y-px text-[9px] font-medium leading-tight',
            holiday ? 'text-sky-900' : 'text-rose-800',
          )}
          data-testid="workshop-labels"
        >
          {workshops.map((w) => (
            <span key={w} className="block truncate" title={w}>
              {w}
            </span>
          ))}
        </div>
      )}

      {holiday?.name && inMonth && !hasWorkshops && (
        <span className="absolute inset-x-1 bottom-0.5 truncate text-[9px] font-medium leading-tight text-sky-800">
          {holiday.name}
        </span>
      )}
    </button>
  )
}

function uniqByIndex(markers: ModuleMarker[]): ModuleMarker[] {
  const seen = new Set<number>()
  const out: ModuleMarker[] = []
  for (const m of markers) {
    if (seen.has(m.moduleIndex)) continue
    seen.add(m.moduleIndex)
    out.push(m)
  }
  out.sort((a, b) => a.moduleIndex - b.moduleIndex)
  return out
}

function ModuleBadge({
  kind,
  moduleIndex,
}: Readonly<{ kind: 'start' | 'end'; moduleIndex: number }>) {
  const isStart = kind === 'start'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border px-1 py-px text-[9px] font-semibold leading-none',
        isStart
          ? 'border-emerald-400 bg-emerald-100 text-emerald-900'
          : 'border-orange-400 bg-orange-100 text-orange-900',
      )}
      aria-label={isStart ? `Modul ${moduleIndex} početak` : `Modul ${moduleIndex} kraj`}
    >
      M{moduleIndex}
      {isStart ? (
        <ArrowUpFromLine className="h-2 w-2" aria-hidden />
      ) : (
        <ArrowDownToLine className="h-2 w-2" aria-hidden />
      )}
    </span>
  )
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50" />
        Radionica
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-rose-200 bg-rose-50" />
        Radionica (cijeli dan)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-100" />
        Praznik
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-emerald-400 bg-emerald-100 px-1 py-px text-[9px] font-semibold leading-none text-emerald-900">
          M1 <ArrowUpFromLine className="h-2 w-2" />
        </span>
        Početak modula
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-orange-400 bg-orange-100 px-1 py-px text-[9px] font-semibold leading-none text-orange-900">
          M1 <ArrowDownToLine className="h-2 w-2" />
        </span>
        Kraj modula
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-sm border border-emerald-700 bg-white px-1 py-px text-[9px] font-semibold leading-none text-emerald-900">
          28.
        </span>
        28. radionica (zadnja)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded ring-2 ring-cyan-500" />
        Danas
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded ring-2 ring-cyan-600 ring-offset-1" />
        Početak raspona
      </span>
    </div>
  )
}
