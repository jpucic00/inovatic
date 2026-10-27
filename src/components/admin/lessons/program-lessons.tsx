import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import type { ProgramLessonModule, ProgramLessonRow } from '@/actions/admin/program-materials'
import { buildLessonOutline, NO_SAT_HINT, NO_SAT_LABEL, satDateLabel } from '@/lib/lesson-outline'
import { formatLessonSessions, PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'
import { croatianPlural } from '@/lib/format'
import { StaffMaterialList } from '@/components/material/staff-material-list'
import type { MaterialCityControls } from '@/components/material/city-only-note'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'

interface Props {
  courseId: string
  modules: ProgramLessonModule[]
  /** Natjecateljski program: modules are natjecanja, which changes two hints. */
  competition: boolean
  /** "Samo za <grad>" on the whole-module rows; null for a radionica. */
  cityControls?: MaterialCityControls | null
}

/**
 * The program's curriculum, one card per module (one untitled card for a
 * radionica). A dated module also lists every sat no lesson holds yet, in its
 * place — the gap is the thing to notice, and each one is a shortcut to a new
 * lesson on that sat.
 */
export function ProgramLessons({ courseId, modules, competition, cityControls = null }: Readonly<Props>) {
  return (
    <div className="space-y-4">
      {modules.map((entry) => (
        <ModuleLessonsCard
          key={entry.module?.id ?? 'program'}
          courseId={courseId}
          entry={entry}
          competition={competition}
          cityControls={cityControls}
        />
      ))}
    </div>
  )
}

function newLessonHref(courseId: string, moduleId: string | null, sat?: number): string {
  const params = new URLSearchParams()
  if (moduleId) params.set('modul', moduleId)
  if (sat !== undefined) params.set('sat', String(sat))
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return `/admin/programi/${courseId}/lekcija/nova${suffix}`
}

function satLabel(n: number): string {
  return n === PROBNI_SAT_SESSION ? 'Probni sat' : `${n}. sat`
}

function ModuleLessonsCard({
  courseId,
  entry,
  competition,
  cityControls,
}: Readonly<{
  courseId: string
  entry: ProgramLessonModule
  competition: boolean
  cityControls: MaterialCityControls | null
}>) {
  const moduleId = entry.module?.id ?? null
  const outline = buildLessonOutline({
    lessons: entry.lessons,
    // A natjecanje has a sat a week all season: listing every free one would
    // bury its few lessons, so only a standard module lists its gaps.
    dated: entry.dated && !competition,
    isFirstModule: entry.isFirstModule,
  })
  const lessonCount = entry.lessons.length

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {entry.module ? (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900">{entry.module.title}</h3>
          <span className="shrink-0 text-xs text-gray-500">
            {lessonCount} {croatianPlural(lessonCount, 'lekcija', 'lekcije', 'lekcija')}
          </span>
        </div>
      ) : null}

      {outline.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-500">Još nema lekcija.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {outline.map((item) =>
            item.kind === 'lesson' ? (
              <LessonRow
                key={item.lesson.id}
                courseId={courseId}
                lesson={item.lesson}
                dated={entry.dated}
              />
            ) : (
              <li key={`free-${item.sessionNumber}`}>
                <Link
                  href={newLessonHref(courseId, moduleId, item.sessionNumber)}
                  className="group flex min-h-11 items-center gap-3 px-4 py-2 text-gray-400 hover:bg-gray-50"
                >
                  <SatColumn label={satLabel(item.sessionNumber)} date={satDateLabel(entry.satDates, item.sessionNumber)} muted />
                  <span className="min-w-0 flex-1 text-sm italic">bez lekcije</span>
                  <Plus className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </Link>
              </li>
            ),
          )}
        </ul>
      )}

      {entry.module ? (
        <details className="group border-t border-gray-100">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
            Za nastavnike — cijeli {competition ? 'natjecanje' : 'modul'} ({entry.teacherMaterials.length})
          </summary>
          <div className="space-y-3 px-4 pb-4 pt-1">
            <p className="text-xs text-gray-500">
              Priprema koja vrijedi za svaki sat {competition ? 'ovog natjecanja' : 'ovog modula'}. Vide je
              samo nastavnici, u svim grupama.
            </p>
            <StaffMaterialList
              rows={entry.teacherMaterials}
              cityControls={cityControls}
              emptyLabel={`Još nema materijala za cijeli ${competition ? 'natjecanje' : 'modul'}.`}
            />
            <UploadMaterialDialog
              target={{ scope: 'MODULE', moduleId: entry.module.id }}
              label="Dodaj"
              scopeLabel={`Samo za nastavnike, za svaki sat — „${entry.module.title}".`}
            />
          </div>
        </details>
      ) : null}

      <div className="border-t border-gray-100 px-4 py-3">
        <Link
          href={newLessonHref(courseId, moduleId)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 sm:min-h-9"
        >
          <Plus className="h-4 w-4" />
          Nova lekcija
        </Link>
      </div>
    </div>
  )
}

function LessonRow({
  courseId,
  lesson,
  dated,
}: Readonly<{ courseId: string; lesson: ProgramLessonRow; dated: boolean }>) {
  const counts = `${lesson.teacherCount} nast. · ${lesson.studentCount} pol.`
  let label: string | null = null
  if (lesson.sessionNumbers.length > 0) label = formatLessonSessions(lesson.sessionNumbers)
  // A dated module's lesson without a sat is reached by no group on any date,
  // so a parent never sees it — the admin has to pick its sat.
  else if (dated) label = NO_SAT_LABEL

  return (
    <li>
      <Link
        href={`/admin/programi/${courseId}/lekcija/${lesson.id}`}
        className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
      >
        {/* No date on a lesson row: a lesson spanning several sats has no single
            date, and its first sat's alone reads as the whole lesson's. Free sat
            rows keep theirs — one sat, one (weekday-range) date. */}
        {label ? <SatColumn label={label} date={null} warn={lesson.sessionNumbers.length === 0} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{lesson.title}</span>
          {label === NO_SAT_LABEL ? (
            <span className="block text-xs text-amber-700">{NO_SAT_HINT}</span>
          ) : null}
          <span className="block text-xs text-gray-500 sm:hidden">{counts}</span>
        </span>
        <span className="hidden shrink-0 text-xs tabular-nums text-gray-500 sm:inline">{counts}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      </Link>
    </li>
  )
}

function SatColumn({
  label,
  date,
  muted = false,
  warn = false,
}: Readonly<{ label: string; date: string | null; muted?: boolean; warn?: boolean }>) {
  let tone = 'text-cyan-700'
  if (muted) tone = 'text-gray-400'
  else if (warn) tone = 'text-amber-700'
  return (
    <span className="w-24 shrink-0 sm:w-28">
      <span className={`block text-xs font-semibold leading-tight ${tone}`}>{label}</span>
      {date ? <span className="block text-[11px] leading-tight tabular-nums text-gray-400">{date}</span> : null}
    </span>
  )
}
