import Link from 'next/link'
import { Clock, CalendarDays, MapPin } from 'lucide-react'
import { availableSpotsTone, formatAvailableSpots } from '@/lib/available-spots'
import { isRadionica } from '@/lib/program-kind'
import type { PublicSchedule, ScheduleSlot } from '@/lib/public-schedule'

const PILL_CLASS = {
  full: 'bg-gray-100 text-gray-500 border-gray-200',
  low: 'bg-amber-50 text-amber-800 border-amber-200',
  open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
} as const

const DOT_CLASS = {
  full: 'bg-gray-400',
  low: 'bg-amber-500',
  open: 'bg-emerald-500',
} as const

function SpotsPill({ availableSpots }: Readonly<{ availableSpots: number }>) {
  const tone = availableSpotsTone(availableSpots)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${PILL_CLASS[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tone]}`} aria-hidden="true" />
      {formatAvailableSpots(availableSpots)}
    </span>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      {(
        [
          ['open', 'Slobodna mjesta'],
          ['low', 'Zadnja mjesta'],
          ['full', 'Popunjeno'],
        ] as const
      ).map(([tone, label]) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${DOT_CLASS[tone]}`} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  )
}

/** The marketing page of the program — a radionica's IS its `/radionice` page. */
function programInfoPath(slot: ScheduleSlot): string {
  return isRadionica(slot.kind) ? `/radionice/${slot.programSlug}` : `/programi/${slot.programSlug}`
}

function TerminCard({ slot, showVenue }: Readonly<{ slot: ScheduleSlot; showVenue: boolean }>) {
  return (
    <article
      className={`flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${slot.isFull ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        {slot.badge !== null && (
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-yellow-400 text-base font-extrabold text-gray-900"
            aria-hidden="true"
          >
            {slot.badge}
          </span>
        )}
        <div className="min-w-0">
          <Link
            href={programInfoPath(slot)}
            className="text-[13px] font-bold leading-tight text-gray-900 hover:text-cyan-600 hover:underline"
          >
            {slot.programTitle}
          </Link>
          <p className="text-xs text-gray-500">
            {slot.ageMin}–{slot.ageMax} godina
          </p>
        </div>
      </div>
      {slot.dates && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <CalendarDays className="h-4 w-4 flex-none text-cyan-500" aria-hidden="true" />
          {slot.dates}
        </p>
      )}
      {slot.time && (
        <p className="flex items-center gap-1.5 text-[15px] font-bold text-gray-900">
          <Clock className="h-4 w-4 flex-none text-cyan-500" aria-hidden="true" />
          {slot.time}
        </p>
      )}
      {showVenue && slot.venues.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-gray-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-cyan-500" aria-hidden="true" />
          <span>{slot.venues.join(' / ')}</span>
        </p>
      )}
      <div>
        <SpotsPill availableSpots={slot.availableSpots} />
      </div>
    </article>
  )
}

type Props = {
  schedule: PublicSchedule
  cityLabel: string
}

/**
 * Weekday columns of termin cards plus the radionice strip. Server-rendered —
 * there is nothing here to interact with; the city switch is a link and the
 * termin is picked in `/prijava`, not on this page.
 */
export function PublicScheduleView({ schedule, cityLabel }: Readonly<Props>) {
  if (schedule.isEmpty) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
        <h2 className="mb-2 text-lg font-bold text-gray-900">Trenutno nema otvorenih termina za {cityLabel}</h2>
        <p className="text-sm leading-relaxed text-gray-500">
          Čim se otvore upisi, ovdje ćete vidjeti termine i broj slobodnih mjesta. U međuvremenu
          nam možete poslati prijavu – javit ćemo vam se s terminima čim budu poznati.
        </p>
      </div>
    )
  }

  // With one venue in the whole city the header already names it; only a city
  // that teaches in two places labels each card.
  const showVenue = schedule.venues.length > 1
  const hasWeekly = schedule.weekly.some((d) => d.slots.length > 0)

  return (
    <div className="flex flex-col gap-10">
      {hasWeekly && (
        <section aria-labelledby="tjedni-programi">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="tjedni-programi" className="text-xl font-extrabold text-gray-900 md:text-2xl">
              Tjedni programi
            </h2>
            <Legend />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {schedule.weekly.map((day) => {
              const active = day.slots.length > 0
              return (
                // A day with no termin is worth a column on a wide screen (the
                // week reads as a week) but only noise on a phone.
                <div key={day.label} className={`flex-col gap-2.5 ${active ? 'flex' : 'hidden md:flex'}`}>
                  <h3
                    className={`border-b-2 pb-2 pt-1 text-xs font-extrabold uppercase tracking-wider ${active ? 'border-cyan-500 text-gray-900' : 'border-gray-200 text-gray-400'}`}
                  >
                    {day.label}
                  </h3>
                  {active ? (
                    day.slots.map((slot) => <TerminCard key={slot.key} slot={slot} showVenue={showVenue} />)
                  ) : (
                    <p className="rounded-2xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                      Nema termina
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {schedule.radionice.length > 0 && (
        <section aria-labelledby="radionice">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="radionice" className="text-xl font-extrabold text-gray-900 md:text-2xl">
              Radionice
            </h2>
            {!hasWeekly && <Legend />}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {schedule.radionice.map((slot) => (
              <TerminCard key={slot.key} slot={slot} showVenue={showVenue} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
