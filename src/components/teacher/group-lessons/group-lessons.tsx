'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  StaffGroupLessons,
  StaffLesson,
  StaffLessonModule,
} from '@/actions/teacher/materials'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import { LessonMaterialSection } from '@/components/material/lesson-material-section'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import { croatianPlural } from '@/lib/format'
import { moduleKey, resolveLessonFocus } from './lesson-focus'

interface Props {
  data: StaffGroupLessons
  /**
   * False on an archived school year: no adding, moving, editing or hiding —
   * the rows are shown exactly as they were.
   */
  editable: boolean
  /** Natjecateljski program: its modules are natjecanja. */
  competition?: boolean
}

/**
 * `firstDate` is a UTC midnight naming a Europe/Zagreb day (`@db.Date`), so it
 * is read with UTC getters — a locale formatter prints the server's day on the
 * server and the browser's on the client, a hydration mismatch.
 */
function dayMonth(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.`
}

/** "Moving into the polaznici" reaches this group's families only. */
const GROUP_STUDENT_REACH = 'u ovoj grupi'

/**
 * A group's Materijali for staff, laid out the way the class runs: module by
 * module, lesson by lesson, each lesson with what the teacher prepares and
 * what the children open.
 *
 * Curriculum rows come from the program page and are read-only here apart from
 * the hide toggle; the group's own rows (`canEdit`) can be edited, deleted and
 * moved. Everything is collapsible and only the lessons being taught or
 * prepared start open (`resolveLessonFocus`) — a whole year of lessons, each
 * with two drop zones, is far too long to scroll on a phone.
 */
export function GroupLessons({ data, editable, competition = false }: Readonly<Props>) {
  const focus = resolveLessonFocus(data.modules)
  const [openModules, setOpenModules] = useState<ReadonlySet<string>>(() => focus.openModuleKeys)
  const [openLessons, setOpenLessons] = useState<ReadonlySet<string>>(() => focus.openLessonIds)

  const toggle = (set: typeof setOpenModules, key: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // An archived year shows its rows as they were: nothing editable, no toggles.
  const view = (rows: StaffMaterialRow[]) => (editable ? rows : rows.map((r) => ({ ...r, canEdit: false })))
  const inGroupId = editable ? data.groupId : null
  const noLessons = data.modules.every((m) => m.lessons.length === 0)

  return (
    <div className="space-y-4">
      {data.programTeacherRows.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <WideTeacherRows
            label="Za nastavnike — cijeli program"
            hint="Priprema za svaki sat ovog programa. Vide je samo nastavnici."
            rows={view(data.programTeacherRows)}
            inGroupId={inGroupId}
          />
        </div>
      ) : null}

      {noLessons ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Program još nema lekcija. Lekcije dodaje administracija na stranici programa.
        </p>
      ) : (
        data.modules.map((m) => (
          <ModuleCard
            key={moduleKey(m)}
            module={m}
            open={m.moduleId === null || openModules.has(moduleKey(m))}
            onToggle={() => toggle(setOpenModules, moduleKey(m))}
            competition={competition}
          >
            {m.lessons.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-500">
                {competition ? 'Ovo natjecanje još nema lekcija.' : 'Ovaj modul još nema lekcija.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {m.lessons.map((lesson) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    current={lesson.id === focus.currentLessonId}
                    next={lesson.id === focus.nextLessonId}
                    open={openLessons.has(lesson.id)}
                    onToggle={() => toggle(setOpenLessons, lesson.id)}
                  >
                    <LessonSections
                      groupId={data.groupId}
                      lesson={lesson}
                      siblings={m.lessons}
                      editable={editable}
                      inGroupId={inGroupId}
                      view={view}
                    />
                  </LessonItem>
                ))}
              </ul>
            )}

            {m.moduleId !== null && m.teacherRows.length > 0 ? (
              <div className="border-t border-gray-200 bg-gray-50/60 px-4 py-4">
                <WideTeacherRows
                  label={`Za nastavnike — cijel${competition ? 'o natjecanje' : 'i modul'}`}
                  hint={`Priprema za svaki sat ${competition ? 'ovog natjecanja' : 'ovog modula'}. Vide je samo nastavnici.`}
                  rows={view(m.teacherRows)}
                  inGroupId={inGroupId}
                />
              </div>
            ) : null}
          </ModuleCard>
        ))
      )}
    </div>
  )
}

function ModuleCard({
  module,
  open,
  onToggle,
  competition,
  children,
}: Readonly<{
  module: StaffLessonModule
  open: boolean
  onToggle: () => void
  competition: boolean
  children: ReactNode
}>) {
  // A radionica has one list and nothing to fold: no header at all.
  if (module.moduleId === null) {
    return <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">{children}</div>
  }

  const panelId = `modul-${module.moduleId}`
  const count = module.lessons.length
  const start = module.lessons.find((l) => l.firstDate !== null)?.firstDate ?? null
  const meta = [
    `${count} ${croatianPlural(count, 'lekcija', 'lekcije', 'lekcija')}`,
    start ? `od ${dayMonth(start)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      className={[
        'overflow-hidden rounded-xl border bg-white',
        module.isActive ? 'border-cyan-300' : 'border-gray-200',
      ].join(' ')}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
        >
          <ChevronRight
            aria-hidden
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold leading-snug text-gray-900">{module.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {module.isActive ? (
                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cyan-800">
                  {competition ? 'Aktivno natjecanje' : 'Aktivni modul'}
                </span>
              ) : null}
              <span className="text-xs text-gray-500">{meta}</span>
            </span>
          </span>
        </button>
      </h2>
      {/* Folded modules unmount their lessons: a year is four modules of seven
          lessons, and nothing in a closed one needs to exist yet. */}
      <div id={panelId} hidden={!open} className="border-t border-gray-200">
        {open ? children : null}
      </div>
    </section>
  )
}

function LessonItem({
  lesson,
  current,
  next,
  open,
  onToggle,
  children,
}: Readonly<{
  lesson: StaffLesson
  current: boolean
  next: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}>) {
  // Once opened a lesson stays mounted while folded, so a file still uploading
  // into it is not dropped by a tap on its header.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  const panelId = `lekcija-${lesson.id}`
  const sats = lesson.sessionNumbers.length > 0 ? formatLessonSessions(lesson.sessionNumbers) : null
  const date = lesson.firstDate ? dayMonth(lesson.firstDate) : null
  const meta = [sats, date].filter(Boolean).join(' · ')
  const counts = `${lesson.teacherRows.length} za nast. · ${lesson.studentRows.length} za pol.`

  let tint: string | undefined
  if (current) tint = 'bg-cyan-50/50'
  else if (next) tint = 'bg-amber-50/40'

  return (
    <li className={tint}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
        >
          <span className="min-w-0 flex-1">
            {/* Badges ride on the meta line, so at 390px they never squeeze
                the title into a narrow column. */}
            {meta || current || next ? (
              <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {meta ? <span className="text-xs font-medium text-gray-500">{meta}</span> : null}
                {current ? (
                  <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Trenutna lekcija
                  </span>
                ) : null}
                {next ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                    Sljedeća
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="block text-[15px] font-semibold leading-snug text-gray-900">{lesson.title}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{counts}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="space-y-5 px-4 pb-5">
        {mounted ? children : null}
      </div>
    </li>
  )
}

function LessonSections({
  groupId,
  lesson,
  siblings,
  editable,
  inGroupId,
  view,
}: Readonly<{
  groupId: string
  lesson: StaffLesson
  siblings: StaffLesson[]
  editable: boolean
  inGroupId: string | null
  view: (rows: StaffMaterialRow[]) => StaffMaterialRow[]
}>) {
  const add = editable
    ? ({ mode: 'create', target: { scope: 'GROUP', scheduledGroupId: groupId, lessonId: lesson.id } } as const)
    : null
  // The server moves a material only within its module, so only this module's
  // other lessons are offered.
  const moveLessonOptions = editable
    ? siblings
        .filter((l) => l.id !== lesson.id)
        .map((l) => {
          const sats = l.sessionNumbers.length > 0 ? formatLessonSessions(l.sessionNumbers) : null
          // A lesson titled after its sat ("Probni sat") does not repeat it.
          return { id: l.id, label: sats && sats !== l.title ? `${l.title} (${sats})` : l.title }
        })
    : []

  return (
    <>
      {lesson.description ? <p className="text-sm text-gray-600">{lesson.description}</p> : null}
      <LessonMaterialSection
        audience="TEACHER"
        heading="Za nastavnike"
        hint="Priprema i ono što prezentirate — polaznici ih ne vide."
        rows={view(lesson.teacherRows)}
        emptyLabel="Nema materijala za nastavnike."
        add={add}
        canMoveAudience={editable}
        moveLessonOptions={moveLessonOptions}
        studentReach={GROUP_STUDENT_REACH}
        inGroupId={inGroupId}
        headingLevel={4}
      />
      <LessonMaterialSection
        audience="STUDENT"
        heading="Za polaznike"
        hint="Vide ih djeca i roditelji ove grupe na portalu."
        rows={view(lesson.studentRows)}
        emptyLabel="Nema materijala za polaznike."
        add={add}
        canMoveAudience={editable}
        moveLessonOptions={moveLessonOptions}
        studentReach={GROUP_STUDENT_REACH}
        inGroupId={inGroupId}
        headingLevel={4}
      />
    </>
  )
}

/**
 * Whole-program / whole-module teacher rows: set on the program page, so
 * read-only here apart from the hide toggle. Rendered only when there are any.
 */
function WideTeacherRows({
  label,
  hint,
  rows,
  inGroupId,
}: Readonly<{
  label: string
  hint: string
  rows: StaffMaterialRow[]
  inGroupId: string | null
}>) {
  return (
    <LessonMaterialSection
      audience="TEACHER"
      heading={label}
      hint={hint}
      rows={rows}
      add={null}
      inGroupId={inGroupId}
      headingLevel={3}
    />
  )
}
