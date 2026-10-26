'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { kindOf } from '@/lib/material-display'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import type { LessonView } from '@/lib/group-materials-view'
import { InteractiveGuide } from './interactive-guide'
import { MaterialCards } from './extra-materials'

/**
 * `firstDate` is a UTC-midnight date naming a Europe/Zagreb calendar day (the
 * `@db.Date` convention), so it is read with UTC getters. A locale formatter
 * would print the server's day on the server and the browser's on the client —
 * a hydration mismatch, and the wrong day for anyone west of UTC.
 */
export function formatDayMonth(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.`
}

/**
 * One module's lessons as an accordion: the current lesson open, the rest one
 * tap away.
 *
 * The whole module is shown (owner decision, Materijali v2) so a child who
 * missed a class, or wants to look ahead, can open any lesson — but the one
 * the group is on now is what they came for, so it is the one already open.
 *
 * What opens first comes straight from `currentLessonId`, which the server
 * resolved: on a dated module that is the lesson whose first sat has passed
 * most recently, and nothing before the first one starts; on an undated module
 * (radionica, natjecanje) it is the first lesson. The initial state is a pure
 * function of props, so the server render and the first client render agree.
 */
export function LessonAccordion({
  lessons,
  currentLessonId,
}: Readonly<{ lessons: LessonView[]; currentLessonId: string | null }>) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(currentLessonId ? [currentLessonId] : []),
  )

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Only a dated module can be "not started yet"; an undated one always has
  // its first lesson current.
  const firstStart = currentLessonId === null ? lessons.find((l) => l.firstDate)?.firstDate : null

  return (
    <div>
      {firstStart ? (
        <p className="mb-3 text-sm text-gray-600">
          Prva lekcija počinje {formatDayMonth(firstStart)}
        </p>
      ) : null}

      <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {lessons.map((lesson) => (
          <LessonItem
            key={lesson.id}
            lesson={lesson}
            open={openIds.has(lesson.id)}
            onToggle={() => toggle(lesson.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function LessonItem({
  lesson,
  open,
  onToggle,
}: Readonly<{ lesson: LessonView; open: boolean; onToggle: () => void }>) {
  const panelId = `lekcija-${lesson.id}`
  // Sats only, no date: a lesson spanning several sats has no single date, and
  // its first sat's alone reads as the whole lesson's (owner, 2026-10-10).
  const meta = lesson.sessionNumbers.length > 0 ? formatLessonSessions(lesson.sessionNumbers) : ''
  // "Trenutna" is a claim about the calendar. An undated lesson is current only
  // because it comes first, so it gets opened but not labelled.
  const showCurrent = lesson.isCurrent && lesson.firstDate !== null

  return (
    <li className={showCurrent ? 'bg-cyan-50/40' : undefined}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
        >
          <span className="min-w-0 flex-1">
            {/* The badge rides on the meta line rather than beside the title, so
                at 390px it never squeezes the title into a narrow column. */}
            {meta || showCurrent ? (
              <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {meta ? <span className="text-xs font-medium text-gray-500">{meta}</span> : null}
                {showCurrent ? (
                  <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Trenutna lekcija
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="block text-[15px] font-semibold leading-snug text-gray-900">
              {lesson.title}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>

      {/* The panel element always exists so aria-controls points at something;
          its content mounts only when open, which keeps a closed lesson's
          videos and guide out of the page. */}
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        {open ? <LessonBody lesson={lesson} /> : null}
      </div>
    </li>
  )
}

/**
 * The parent's view of a dated module: the one lesson the group is on now,
 * already open — there is nothing else to pick, so it is a card, not an
 * accordion of one. Its sats are named, never dates (owner, 2026-10-10).
 */
export function CurrentLessonCard({ lesson }: Readonly<{ lesson: LessonView }>) {
  const meta = lesson.sessionNumbers.length > 0 ? formatLessonSessions(lesson.sessionNumbers) : ''
  return (
    <article
      aria-labelledby={`lekcija-${lesson.id}-naslov`}
      className="overflow-hidden rounded-xl border border-cyan-200 bg-white"
    >
      <header className="border-b border-cyan-100 bg-cyan-50/60 px-4 py-3">
        <p className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {meta ? <span className="text-xs font-medium text-gray-500">{meta}</span> : null}
          <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
            Trenutna lekcija
          </span>
        </p>
        <h3 id={`lekcija-${lesson.id}-naslov`} className="text-[15px] font-semibold leading-snug text-gray-900">
          {lesson.title}
        </h3>
      </header>
      <div className="p-4">
        <LessonBody lesson={lesson} />
      </div>
    </article>
  )
}

function LessonBody({ lesson }: Readonly<{ lesson: LessonView }>) {
  const guides = lesson.materials.filter((m) => kindOf(m) === 'robocamp')
  const others = lesson.materials.filter((m) => kindOf(m) !== 'robocamp')

  return (
    <div className="space-y-4">
      {lesson.description ? <p className="text-sm text-gray-600">{lesson.description}</p> : null}
      {guides.map((item) => (
        <InteractiveGuide key={item.id} item={item} moduleTitle={null} headingLevel={4} />
      ))}
      {others.length > 0 ? <MaterialCards items={others} /> : null}
      {lesson.materials.length === 0 ? (
        <p className="text-sm text-gray-500">Za ovu lekciju još nema materijala.</p>
      ) : null}
    </div>
  )
}
