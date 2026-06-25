'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
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

/** Stable empty set so "no range preview" renders don't churn referential deps. */
const EMPTY_KEY_SET: ReadonlySet<string> = new Set()

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

function groupMarkersByDate(
  moduleMarkers: ModuleMarker[],
): Map<string, ModuleMarker[]> {
  const m = new Map<string, ModuleMarker[]>()
  for (const marker of moduleMarkers) {
    const arr = m.get(marker.date) ?? []
    arr.push(marker)
    m.set(marker.date, arr)
  }
  return m
}

function groupWorkshopTitlesByDate(
  workshopLabels: WorkshopLabel[],
): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const w of workshopLabels) {
    const arr = m.get(w.date) ?? []
    arr.push(w.title)
    m.set(w.date, arr)
  }
  return m
}

function collectSessionDateSet(
  sessionDatesByWeekday: Record<string, ReadonlyArray<string>>,
): Set<string> {
  const s = new Set<string>()
  for (const keys of Object.values(sessionDatesByWeekday)) {
    for (const k of keys) s.add(k)
  }
  return s
}

function collectLastSessionDateSet(
  lastSessionDateByWeekday: Record<string, string | null>,
): Set<string> {
  const s = new Set<string>()
  for (const k of Object.values(lastSessionDateByWeekday)) {
    if (k) s.add(k)
  }
  return s
}

function indexInMonthCellsByKey(
  monthGrids: ReadonlyArray<{ cells: CellState[] }>,
): Map<string, CellState> {
  const map = new Map<string, CellState>()
  for (const g of monthGrids) {
    for (const c of g.cells) {
      if (c.inMonth) map.set(c.key, c)
    }
  }
  return map
}

function buildPreviewKeys(
  previewRange: { start: string; end: string } | null,
): ReadonlySet<string> {
  if (!previewRange) return EMPTY_KEY_SET
  const set = new Set<string>()
  let cur = previewRange.start
  // Cap the walk at a full school year so a stray hover can't spin forever.
  for (let i = 0; i < 400 && cur <= previewRange.end; i++) {
    set.add(cur)
    cur = shiftDateKey(cur, 1)
  }
  return set
}

function computeDialogTitle(
  editing: DialogState | null,
  isRange: boolean,
): string {
  if (editing?.existingHoliday) {
    return `Praznik — ${formatDate(editing.startDate, 'long')}`
  }
  if (editing && isRange) {
    return `Označi raspon — ${formatDate(editing.startDate)} – ${formatDate(editing.endDate)} (${dayCount(editing.startKey, editing.endKey)} dana)`
  }
  if (editing) {
    return `Označi kao praznik — ${formatDate(editing.startDate, 'long')}`
  }
  return ''
}

function computeDialogDescription(archived: boolean, isRange: boolean): string {
  if (archived) {
    return 'Pregled arhivirane školske godine — izmjene nisu dozvoljene.'
  }
  return isRange
    ? 'Svi dani u rasponu bit će označeni kao praznik i izuzeti iz evidencije dolaska.'
    : 'Dani označeni kao praznik nisu uključeni u evidenciju dolaska.'
}

function computeSaveLabel(
  editing: DialogState | null,
  isRange: boolean,
  attendanceConflict: number | null,
): string {
  if (attendanceConflict !== null) return 'Da, obriši dolaske i spremi'
  if (editing?.existingHoliday) return 'Ažuriraj'
  return isRange ? 'Spremi raspon' : 'Spremi'
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
  // Cell key staged as the start of a range — set on first single click that
  // *isn't* part of a double-click, consumed by the next click on another cell.
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  // While a range start is staged, the cell currently under the cursor — it
  // drives the live "what you'd select" preview band between the two clicks.
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  // Click-vs-double-click disambiguation. The first click on an empty cell
  // doesn't commit `rangeStart` immediately — it goes into a ref and a 250 ms
  // timer. If a second click arrives in time we resolve it without ever
  // showing the banner (so the calendar doesn't shift mid-action). If not,
  // the timer fires and the banner takes over for slow-path range selection.
  const pendingClickRef = useRef<CellState | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearPendingClick() {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    pendingClickRef.current = null
  }

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current)
    }
  }, [])

  const months = useMemo(() => monthsForSchoolYear(schoolYear), [schoolYear])

  const holidaysByDate = useMemo(
    () => new Map(holidays.map((h) => [h.date, h])),
    [holidays],
  )
  const markersByDate = useMemo(
    () => groupMarkersByDate(moduleMarkers),
    [moduleMarkers],
  )
  const workshopsByDate = useMemo(
    () => groupWorkshopTitlesByDate(workshopLabels),
    [workshopLabels],
  )
  const sessionDateSet = useMemo(
    () => collectSessionDateSet(sessionDatesByWeekday),
    [sessionDatesByWeekday],
  )
  const lastSessionDateSet = useMemo(
    () => collectLastSessionDateSet(lastSessionDateByWeekday),
    [lastSessionDateByWeekday],
  )
  const today = useMemo(todayUtcMidnight, [])

  // Build every month's cell grid once, keyed only on the painted data (not on
  // the transient rangeStart/hoverKey). Moving the mouse during a range pick
  // then never rebuilds the grids — it only flips boolean props on the cells.
  const monthGrids = useMemo(() => {
    const ctx = {
      today,
      sessionDateSet,
      lastSessionDateSet,
      holidaysByDate,
      markersByDate,
      workshopsByDate,
    }
    return months.map((m) => ({ ...m, cells: buildMonthGrid(m.year, m.month, ctx) }))
  }, [
    months,
    today,
    sessionDateSet,
    lastSessionDateSet,
    holidaysByDate,
    markersByDate,
    workshopsByDate,
  ])

  // One global key→cell lookup so a staged range start resolves regardless of
  // which month grid it was clicked in — cross-month ranges included.
  const cellsByKey = useMemo(
    () => indexInMonthCellsByKey(monthGrids),
    [monthGrids],
  )

  // While a start is staged, the hovered cell defines the prospective
  // [start, end] band. Ordered low→high so it reads the same whether the user
  // hovers before or after the anchor day.
  const previewRange = useMemo(() => {
    if (!rangeStart || !hoverKey || rangeStart === hoverKey) return null
    return rangeStart < hoverKey
      ? { start: rangeStart, end: hoverKey }
      : { start: hoverKey, end: rangeStart }
  }, [rangeStart, hoverKey])

  const previewKeys = useMemo<ReadonlySet<string>>(
    () => buildPreviewKeys(previewRange),
    [previewRange],
  )

  const isRange = editing !== null && editing.startKey !== editing.endKey

  function openSingle(cell: CellState) {
    clearPendingClick()
    setRangeStart(null)
    setHoverKey(null)
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
    clearPendingClick()
    setRangeStart(null)
    setHoverKey(null)
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

  function handleCellClick(cell: CellState) {
    if (archived) {
      // Archived years are read-only: a holiday opens a view-only dialog (no
      // save/remove controls), every other cell is inert and rendered disabled.
      if (cell.holiday) openSingle(cell)
      return
    }
    // Clicking an existing holiday always opens the edit dialog and drops
    // any pending range start — keeps editing flow predictable.
    if (cell.holiday) {
      openSingle(cell)
      return
    }
    // Second click inside the disambiguation window: resolve without ever
    // letting the rangeStart banner appear (so the calendar doesn't shift).
    const pending = pendingClickRef.current
    if (pending !== null) {
      if (pending.key === cell.key) {
        // Same cell twice quickly → single-day (this is the "double-click"
        // affordance; works regardless of whether the browser dblclick fires).
        openSingle(cell)
      } else {
        // Two different cells in quick succession → range, no banner flash.
        openRange(pending, cell)
      }
      return
    }
    // Range start already committed via the banner (slow-path follow-up click).
    if (rangeStart !== null) {
      if (rangeStart === cell.key) {
        openSingle(cell)
        return
      }
      const startCell = cellsByKey.get(rangeStart)
      if (!startCell) {
        // Staged cell belonged to a different month rendering pass — fall
        // back to a single-day open so the user isn't stuck.
        openSingle(cell)
        return
      }
      openRange(startCell, cell)
      return
    }
    // Fresh single click — wait briefly to see if a second click follows.
    // If it does, handleCellClick re-enters via `pending` and resolves
    // directly; if not, the timer fires and we stage the banner.
    pendingClickRef.current = cell
    clickTimerRef.current = setTimeout(() => {
      setRangeStart(cell.key)
      pendingClickRef.current = null
      clickTimerRef.current = null
    }, 250)
  }

  function handleCellDoubleClick(cell: CellState) {
    if (archived) {
      if (cell.holiday) openSingle(cell)
      return
    }
    // Safety net for browsers/OSs where dblclick fires but our click-handler
    // disambiguation missed it. openSingle is idempotent so calling it twice
    // (once via the second click, once via dblclick) is harmless.
    openSingle(cell)
  }

  function cancelRange() {
    setRangeStart(null)
    setHoverKey(null)
  }

  // Only track hover once a start is staged — keeps the grid from re-rendering
  // on every mouse move when no range selection is in progress.
  function handleCellHover(cell: CellState) {
    if (!rangeStart || !cell.inMonth) return
    setHoverKey(cell.key)
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

  const dialogTitle = computeDialogTitle(editing, isRange)
  const dialogDescription = computeDialogDescription(archived, isRange)
  const saveLabel = computeSaveLabel(editing, isRange, attendanceConflict)

  return (
    <>
      {/*
        Always rendered (when editable) so its presence never shifts the
        calendar grid below it. Clicking the first range day only swaps the
        bar's *content* — idle hint → active "range start" message — keeping a
        constant height, so cells stay put under the cursor mid-selection.
      */}
      {!archived && (
        <div
          className={cn(
            'flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm transition-colors',
            rangeStart && rangeStartDate
              ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
              : 'border-gray-200 bg-gray-50 text-gray-600',
          )}
        >
          {rangeStart && rangeStartDate ? (
            <>
              {previewRange ? (
                <span>
                  Raspon:{' '}
                  <strong>
                    {formatDate(fromDateKey(previewRange.start))} –{' '}
                    {formatDate(fromDateKey(previewRange.end))}
                  </strong>{' '}
                  ({dayCount(previewRange.start, previewRange.end)} dana) — kliknite za potvrdu.
                </span>
              ) : (
                <span>
                  Početak raspona: <strong>{formatDate(rangeStartDate)}</strong> Kliknite drugi
                  dan za raspon ili dvoklik za samo taj dan.
                </span>
              )}
              <button
                type="button"
                onClick={cancelRange}
                className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-100"
              >
                <X className="h-3.5 w-3.5" />
                Odustani
              </button>
            </>
          ) : (
            <span>
              Kliknite dan da ga označite kao praznik ili dva dana za raspon. Dvoklik označava
              samo jedan dan.
            </span>
          )}
        </div>
      )}

      <div
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        onMouseLeave={() => setHoverKey(null)}
      >
        {monthGrids.map(({ year, month, label, cells }) => (
          <section
            key={`${year}-${month}`}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs"
          >
            <h3 className="mb-2 text-sm font-semibold capitalize text-gray-900">{label}</h3>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAY_LABELS_HEADER.map((wlabel) => (
                <div
                  key={wlabel}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-gray-500"
                >
                  {wlabel}
                </div>
              ))}
              {cells.map((cell) => (
                <DayCell
                  key={cell.key}
                  cell={cell}
                  disabled={archived}
                  isRangeStart={rangeStart === cell.key && cell.inMonth}
                  inPreviewRange={cell.inMonth && previewKeys.has(cell.key)}
                  isPreviewEnd={cell.inMonth && hoverKey === cell.key && rangeStart !== cell.key}
                  onClick={() => handleCellClick(cell)}
                  onDoubleClick={() => handleCellDoubleClick(cell)}
                  onMouseEnter={() => handleCellHover(cell)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <CalendarLegend />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
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
              {editing.markers.map((m) => (
                <li key={`${m.kind}-${m.moduleIndex}-${m.label}`} className="flex items-center gap-1.5">
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
                  variant={attendanceConflict === null ? 'default' : 'destructive'}
                  onClick={() => handleSave(attendanceConflict !== null)}
                  disabled={isPending}
                >
                  {saveLabel}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function dayCellClassName(p: {
  inMonth: boolean
  inPreviewRange: boolean
  holiday: boolean
  isSessionDate: boolean
  hasWorkshops: boolean
  showLastRing: boolean
  isToday: boolean
  isRangeStart: boolean
  isPreviewEnd: boolean
  weekday: number
  disabled: boolean
}): string {
  return cn(
    'relative h-20 rounded-md border p-1 text-left text-xs transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500',
    !p.inMonth && 'border-transparent bg-transparent text-gray-300',
    // The range-preview band overrides the base colors so the prospective
    // selection reads clearly while picking the second day.
    p.inMonth && p.inPreviewRange && 'border-cyan-300 bg-cyan-100 text-cyan-900',
    p.inMonth && !p.inPreviewRange && !p.holiday && !p.isSessionDate && !p.hasWorkshops && 'border-gray-100 bg-white text-gray-600 hover:bg-gray-50',
    p.inMonth && !p.inPreviewRange && !p.holiday && !p.isSessionDate && p.hasWorkshops && 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100',
    p.inMonth && !p.inPreviewRange && !p.holiday && p.isSessionDate && 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
    p.inMonth && !p.inPreviewRange && p.holiday && 'border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200',
    p.showLastRing && 'ring-2 ring-inset ring-emerald-700',
    p.isToday && p.inMonth && !p.isRangeStart && !p.isPreviewEnd && 'ring-2 ring-inset ring-cyan-500',
    p.weekday === 0 && p.inMonth && !p.inPreviewRange && !p.holiday && !p.hasWorkshops && 'text-gray-400',
    p.disabled && 'cursor-default',
  )
}

function dayCellTitle(p: {
  holidayTitle: string
  showLastRing: boolean
  workshops: string[]
  markers: ModuleMarker[]
}): string | undefined {
  return (
    [
      p.holidayTitle,
      p.showLastRing ? 'Zadnja radionica (28. po redu)' : '',
      ...p.workshops.map((w) => `Radionica: ${w}`),
      ...p.markers.map((m) => m.tooltip),
    ]
      .filter(Boolean)
      .join('\n') || undefined
  )
}

function dayCellAriaLabel(p: {
  date: Date
  holiday: boolean
  showLastRing: boolean
  isRangeStart: boolean
}): string {
  return `${p.date.getUTCDate()}. ${p.date.getUTCMonth() + 1}. ${p.date.getUTCFullYear()}${p.holiday ? ' — praznik' : ''}${p.showLastRing ? ' — zadnja radionica' : ''}${p.isRangeStart ? ' — početak raspona' : ''}`
}

function DayCell({
  cell,
  disabled,
  isRangeStart,
  inPreviewRange,
  isPreviewEnd,
  onClick,
  onDoubleClick,
  onMouseEnter,
}: Readonly<{
  cell: CellState
  disabled: boolean
  isRangeStart: boolean
  inPreviewRange: boolean
  isPreviewEnd: boolean
  onClick: () => void
  onDoubleClick: () => void
  onMouseEnter: () => void
}>) {
  const { inMonth, isToday, isSessionDate, isLastSessionDate, holiday, markers, workshops, date, weekday } = cell

  // Dedupe start/end markers by moduleIndex — multiple courses already merge
  // upstream, but a cell can still receive several markers from custom radionice.
  const startBadges = uniqByIndex(markers.filter((m) => m.kind === 'start'))
  const endBadges = uniqByIndex(markers.filter((m) => m.kind === 'end'))
  const showLastRing = isLastSessionDate && inMonth && !holiday
  const hasWorkshops = inMonth && workshops.length > 0
  const holidayNameSuffix = holiday?.name ? `: ${holiday.name}` : ''
  const holidayTitle = holiday ? `Praznik${holidayNameSuffix}` : ''

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      disabled={disabled && !holiday}
      data-date={cell.key}
      data-holiday={holiday ? 'true' : 'false'}
      data-in-month={inMonth ? 'true' : 'false'}
      data-range-start={isRangeStart ? 'true' : 'false'}
      data-session={isSessionDate ? 'true' : 'false'}
      data-last-session={isLastSessionDate ? 'true' : 'false'}
      title={dayCellTitle({ holidayTitle, showLastRing, workshops, markers })}
      className={dayCellClassName({
        inMonth,
        inPreviewRange,
        holiday: !!holiday,
        isSessionDate,
        hasWorkshops,
        showLastRing,
        isToday,
        isRangeStart,
        isPreviewEnd,
        weekday,
        disabled,
      })}
      aria-label={dayCellAriaLabel({ date, holiday: !!holiday, showLastRing, isRangeStart })}
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

      {/*
        Selection rings are inset overlays (not ring-offset on the button) so
        they hug the cell edge cleanly — no offset halo, no clipping by the
        neighbouring cell or the month card.
      */}
      {isRangeStart && (
        <span
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-cyan-600"
          aria-hidden
        />
      )}
      {isPreviewEnd && !isRangeStart && (
        <span
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-cyan-500"
          aria-hidden
        />
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
        <span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50" />{' '}
        Radionica
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-rose-200 bg-rose-50" />{' '}
        Radionica (cijeli dan)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-100" />{' '}
        Praznik
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-emerald-400 bg-emerald-100 px-1 py-px text-[9px] font-semibold leading-none text-emerald-900">
          M1 <ArrowUpFromLine className="h-2 w-2" />
        </span>{' '}
        Početak modula
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-orange-400 bg-orange-100 px-1 py-px text-[9px] font-semibold leading-none text-orange-900">
          M1 <ArrowDownToLine className="h-2 w-2" />
        </span>{' '}
        Kraj modula
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-sm border border-emerald-700 bg-white px-1 py-px text-[9px] font-semibold leading-none text-emerald-900">
          28.
        </span>{' '}
        28. radionica (zadnja)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded ring-2 ring-cyan-500" />{' '}
        Danas
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded ring-2 ring-inset ring-cyan-600" />{' '}
        Početak raspona
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-cyan-300 bg-cyan-100" />{' '}
        Raspon (odabir)
      </span>
    </div>
  )
}
