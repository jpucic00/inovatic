'use client'

import { PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'
import { satDateLabel } from '@/lib/lesson-outline'
import type { SatDateRange } from '@/lib/lesson-sat-dates'

interface Props {
  selected: readonly number[]
  onChange: (next: number[]) => void
  /** The sats to offer, in order (`lessonSessionSlots` — standard 0/1–7, natjecanje 1..N). */
  slots: readonly number[]
  /** Sats other lessons of this module hold — not selectable here. */
  taken: readonly { sessionNumber: number; lessonTitle: string }[]
  satDates: readonly SatDateRange[]
  disabled?: boolean
}

/**
 * Which of the module's sats this lesson covers. The date under each chip is a
 * sample span across every weekday in the admin's city and year — a hint, never
 * stored: the lesson is bound to the sat NUMBER, and each group reaches it on
 * its own day.
 */
export function SatPicker({ selected, onChange, slots, taken, satDates, disabled }: Readonly<Props>) {
  const takenBy = new Map(taken.map((t) => [t.sessionNumber, t.lessonTitle]))

  const toggle = (n: number) => {
    const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n]
    next.sort((a, b) => a - b)
    onChange(next)
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {slots.map((n) => {
          const holder = takenBy.get(n)
          const isSelected = selected.includes(n)
          const dateLabel = satDateLabel(satDates, n)
          const label = n === PROBNI_SAT_SESSION ? 'Probni sat' : `${n}. sat`
          let stateClass = 'border-gray-200 bg-white text-gray-800 hover:border-cyan-300'
          if (holder) stateClass = 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          else if (isSelected) stateClass = 'border-cyan-500 bg-cyan-50 text-cyan-800 ring-1 ring-cyan-500'
          return (
            <button
              key={n}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled || holder !== undefined}
              onClick={() => toggle(n)}
              title={holder ? `Zauzeto: ${holder}` : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center transition-colors ${stateClass}`}
            >
              <span className="text-sm font-semibold leading-tight">{label}</span>
              {dateLabel ? (
                <span className="mt-0.5 text-[11px] leading-tight tabular-nums opacity-80">{dateLabel}</span>
              ) : null}
              {holder ? (
                <span className="mt-0.5 block w-full truncate text-[10px] leading-tight">{holder}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {satDates.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          Primjeri datuma nisu dostupni — plan ove školske godine još nema datume.
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-500">
          Datumi su primjer za odabranu školsku godinu: raspon od najranije do najkasnije grupe u
          tjednu. Lekcija se veže uz sat, ne uz datum.
        </p>
      )}
    </div>
  )
}
