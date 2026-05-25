'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Save, X } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { toast } from 'sonner'
import { bulkMarkSession } from '@/actions/teacher/attendance'
import type {
  AttendanceRecord,
  AttendanceRosterRow,
} from '@/actions/teacher/attendance'
import { formatDate } from '@/lib/format'
import { fromDateKey, todayUtc, toDateKey } from '@/lib/session-dates'

interface Props {
  groupId: string
  isCustom: boolean
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  expectedSessions: string[]
  extraSessions: string[]
  roster: AttendanceRosterRow[]
  records: AttendanceRecord[]
}

type Draft = Record<string, { present: boolean; note: string }>

function pickDefaultDate(expected: string[], extras: string[]): string {
  const today = toDateKey(todayUtc())
  const all = [...new Set([...expected, ...extras])].sort((a, b) => a.localeCompare(b))
  if (all.length === 0) return today

  // Prefer today if it's an expected session; else the nearest past session;
  // else the nearest upcoming session.
  if (all.includes(today)) return today
  const past = all.filter((d) => d <= today)
  if (past.length > 0) return past.at(-1)!
  return all[0]
}

function indexRecords(records: AttendanceRecord[]): Map<string, Map<string, AttendanceRecord>> {
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

function markedCount(roster: AttendanceRosterRow[], byEnrollment: Map<string, AttendanceRecord> | undefined): number {
  if (!byEnrollment) return 0
  return roster.reduce((n, r) => (byEnrollment.has(r.enrollmentId) ? n + 1 : n), 0)
}

export function AttendanceMarker({
  groupId,
  isCustom,
  dayOfWeek,
  dateStart,
  dateEnd,
  startTime,
  endTime,
  expectedSessions,
  extraSessions,
  roster,
  records,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const recordIndex = useMemo(() => indexRecords(records), [records])
  const [adhocDates, setAdhocDates] = useState<string[]>([])
  const allDates = useMemo(() => {
    const merged = [...new Set([...expectedSessions, ...extraSessions, ...adhocDates])]
    merged.sort((a, b) => a.localeCompare(b))
    return merged
  }, [expectedSessions, extraSessions, adhocDates])

  const [selected, setSelected] = useState<string>(() =>
    pickDefaultDate(expectedSessions, extraSessions),
  )
  const [draft, setDraft] = useState<Draft>(() =>
    initDraft(roster, recordIndex.get(selected)),
  )
  const [newDateInput, setNewDateInput] = useState('')

  const handlePickDate = (key: string) => {
    setSelected(key)
    setDraft(initDraft(roster, recordIndex.get(key)))
  }

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
    setSelected(key)
    setDraft(initDraft(roster, recordIndex.get(key)))
    setNewDateInput('')
  }

  const togglePresent = (enrollmentId: string) => {
    setDraft((prev) => ({
      ...prev,
      [enrollmentId]: {
        present: !prev[enrollmentId]?.present,
        note: prev[enrollmentId]?.note ?? '',
      },
    }))
  }

  const setNote = (enrollmentId: string, note: string) => {
    setDraft((prev) => ({
      ...prev,
      [enrollmentId]: {
        present: prev[enrollmentId]?.present ?? false,
        note,
      },
    }))
  }

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

  const endSuffix = endTime ? `–${endTime}` : ''
  const timeRange = startTime ? ` · ${startTime}${endSuffix}` : ''
  let scheduleHint: string | null = null
  if (isCustom && dateStart && dateEnd) {
    const rangeLabel =
      dateStart === dateEnd
        ? formatDate(fromDateKey(dateStart))
        : `${formatDate(fromDateKey(dateStart))} – ${formatDate(fromDateKey(dateEnd))}`
    scheduleHint = `${rangeLabel}${timeRange}`
  } else if (dayOfWeek) {
    scheduleHint = `${dayOfWeek}${timeRange}`
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* ── Left column: date list ─────────────────────────────────────────── */}
      <aside className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Termini</h3>
          {scheduleHint ? (
            <p className="text-xs text-gray-500">{scheduleHint}</p>
          ) : null}
        </div>

        {allDates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-xs text-gray-500">
            Za ovu grupu nema definiranih modula s rasporedom. Dodajte termin ručno ispod.
          </p>
        ) : (
          <ul className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {allDates.map((key) => {
              const marked = markedCount(roster, recordIndex.get(key))
              const total = roster.length
              const isActive = key === selected
              const isFuture = key > toDateKey(todayUtc())
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handlePickDate(key)}
                    className={[
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md border transition-colors text-left',
                      isActive
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">{sessionLabel(key)}</span>
                      {isFuture ? (
                        <span className="block text-[11px] text-gray-400">
                          nadolazeći
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={[
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        (() => {
                          if (marked === 0) return 'bg-gray-100 text-gray-500'
                          if (marked === total) return 'bg-emerald-100 text-emerald-700'
                          return 'bg-amber-100 text-amber-700'
                        })(),
                      ].join(' ')}
                    >
                      {marked}/{total}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <label htmlFor="adhoc-date" className="block text-xs font-medium text-gray-600 mb-1.5">
            Dodaj datum ručno
          </label>
          <div className="flex gap-2">
            <DateInput
              id="adhoc-date"
              value={newDateInput}
              onChange={setNewDateInput}
              className="flex-1 min-w-0 w-full px-2 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={handleAddAdhoc}
              disabled={!newDateInput}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Dodaj
            </button>
          </div>
        </div>
      </aside>

      {/* ── Right column: roster grid ──────────────────────────────────────── */}
      <section>
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {sessionLabel(selected)}
            </h3>
            <p className="text-xs text-gray-500">
              Označite prisutnost za svakog polaznika i spremite.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
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
        </header>

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
              {roster.map((r) => {
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
                          onClick={() => togglePresent(r.enrollmentId)}
                          aria-pressed={d.present}
                          aria-label={d.present ? 'Prisutan' : 'Odsutan'}
                          className={[
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
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
                        onChange={(e) => setNote(r.enrollmentId, e.target.value)}
                        placeholder="npr. opravdano, zakasnio"
                        className="w-full px-2 py-1 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
      // Default to "present" when no record yet — teachers more often mark
      // the exceptions than the whole class.
      present: rec ? rec.present : true,
      note: rec?.note ?? '',
    }
  }
  return draft
}
