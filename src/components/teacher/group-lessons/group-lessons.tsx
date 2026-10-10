'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type {
  StaffGroupLessons,
  StaffLesson,
  StaffLessonModule,
} from '@/actions/teacher/materials'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import type { MaterialItem } from '@/lib/group-materials-view'
import { InteractiveGuide } from '@/components/portal/interactive-guide'
import { MaterialCards } from '@/components/portal/extra-materials'
import { DeleteMaterialButton } from '@/components/material/delete-material-button'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import { kindOf } from '@/lib/material-display'
import { croatianPlural } from '@/lib/format'
import { moduleKey, resolveLessonFocus } from './lesson-focus'
import { AddGroupMaterialDialog } from './add-group-material-dialog'

interface Props {
  data: StaffGroupLessons
  /**
   * False on an archived school year or for a substitute: the materials can be
   * read and downloaded, nothing can be added.
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

/**
 * A group's Materijali for staff, as a tree: module → lesson → materials, laid
 * out the way the class runs (owner, 2026-10-10).
 *
 * It is a READING page — teachers come here to open, download and present, so
 * every material is a card (the same ones the portal shows) and the
 * interactive guide is embedded. The lesson being taught stands apart: it is
 * always open and cannot be folded away. Every other lesson and module opens
 * on a tap. Adding goes through the "Dodaj materijal" modal, which asks for the
 * lesson; the one other control is a delete button beside a material THIS
 * GROUP added (`canEdit` — the uploader, or an admin of the group's city), so a
 * wrong upload can be taken back. Curriculum materials have none (owner,
 * 2026-10-10).
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

  const noLessons = data.modules.every((m) => m.lessons.length === 0)

  return (
    <div className="space-y-4">
      {editable && !noLessons ? (
        <div>
          <AddGroupMaterialDialog
            groupId={data.groupId}
            modules={data.modules}
            defaultLessonId={focus.currentLessonId ?? focus.nextLessonId}
            competition={competition}
          />
        </div>
      ) : null}

      {data.programTeacherRows.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <ReadingSection
            heading="Za nastavnike — cijeli program"
            rows={data.programTeacherRows}
            headingLevel={3}
          />
        </div>
      ) : null}

      {noLessons ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Program još nema lekcija. Lekcije dodaje administracija na stranici programa.
        </p>
      ) : (
        data.modules.map((m) => (
          <ModuleNode
            key={moduleKey(m)}
            module={m}
            open={m.moduleId === null || openModules.has(moduleKey(m))}
            onToggle={() => toggle(setOpenModules, moduleKey(m))}
            competition={competition}
          >
            {m.lessons.length === 0 ? (
              <p className="py-3 pl-2 text-sm text-gray-500">
                {competition ? 'Ovo natjecanje još nema lekcija.' : 'Ovaj modul još nema lekcija.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {m.lessons.map((lesson) => {
                  const current = lesson.id === focus.currentLessonId
                  return (
                    <LessonNode
                      key={lesson.id}
                      lesson={lesson}
                      current={current}
                      next={lesson.id === focus.nextLessonId}
                      open={current || openLessons.has(lesson.id)}
                      onToggle={() => toggle(setOpenLessons, lesson.id)}
                    >
                      {lesson.description ? (
                        <p className="text-sm text-gray-600">{lesson.description}</p>
                      ) : null}
                      <ReadingSection
                        heading="Za nastavnike"
                        rows={lesson.teacherRows}
                        emptyLabel="Nema materijala za nastavnike."
                        canDelete={editable}
                      />
                      <ReadingSection
                        heading="Za polaznike"
                        rows={lesson.studentRows}
                        emptyLabel="Nema materijala za polaznike."
                        moduleTitle={m.title}
                        canDelete={editable}
                      />
                    </LessonNode>
                  )
                })}
              </ul>
            )}

            {m.moduleId !== null && m.teacherRows.length > 0 ? (
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <ReadingSection
                  heading={`Za nastavnike — cijel${competition ? 'o natjecanje' : 'i modul'}`}
                  rows={m.teacherRows}
                />
              </div>
            ) : null}
          </ModuleNode>
        ))
      )}
    </div>
  )
}

function ModuleNode({
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
  // A radionica has one list and nothing to fold: no module node at all.
  if (module.moduleId === null) {
    return <div className="rounded-xl border border-gray-200 bg-white p-3">{children}</div>
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
        'rounded-xl border bg-white',
        module.isActive ? 'border-cyan-300' : 'border-gray-200',
      ].join(' ')}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
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
      {/* The lessons hang off the module like a tree: indented under its
          chevron and joined by a guide line. Folded modules unmount them. */}
      <div id={panelId} hidden={!open} className="pb-3 pl-6 pr-3 sm:pl-7">
        {open ? <div className="border-l-2 border-gray-100 pl-2 sm:pl-3">{children}</div> : null}
      </div>
    </section>
  )
}

function LessonNode({
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
  const panelId = `lekcija-${lesson.id}`
  // Sats only, no date: a lesson spanning several sats has no single date
  // (owner, 2026-10-10).
  const sats = lesson.sessionNumbers.length > 0 ? formatLessonSessions(lesson.sessionNumbers) : ''
  const counts = `${lesson.teacherRows.length} za nast. · ${lesson.studentRows.length} za pol.`

  const label = (
    <span className="min-w-0 flex-1">
      {sats || current || next ? (
        <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {sats ? <span className="text-xs font-medium text-gray-500">{sats}</span> : null}
          {current ? (
            <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Trenutna lekcija
            </span>
          ) : null}
          {next ? (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Sljedeća lekcija
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="block text-[15px] font-semibold leading-snug text-gray-900">{lesson.title}</span>
      <span className="mt-0.5 block text-xs text-gray-500">{counts}</span>
    </span>
  )

  // The lesson being taught is always open — it is what the teacher came for —
  // so its heading is not a toggle, and it stands apart in its own card.
  if (current) {
    return (
      <li className="my-2 rounded-lg border border-cyan-200 bg-cyan-50/40">
        <h3 className="flex min-h-14 items-center gap-3 px-3 py-3">{label}</h3>
        <div id={panelId} className="space-y-5 px-3 pb-4">
          {children}
        </div>
      </li>
    )
  }

  // The next lesson — what the teacher prepares — gets its own softer card so
  // it reads at a glance, but stays closed and lighter than the cyan current
  // lesson, which remains the focus of the page.
  return (
    <li className={next ? 'my-2 rounded-lg border border-amber-200 bg-amber-50/70' : undefined}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={[
            'flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600',
            next ? 'hover:bg-amber-100/60' : 'hover:bg-gray-50',
          ].join(' ')}
        >
          <ChevronRight
            aria-hidden
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          {label}
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="space-y-5 pb-4 pl-8 pr-2">
        {open ? children : null}
      </div>
    </li>
  )
}

function toItem(row: StaffMaterialRow): MaterialItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    audience: row.audience,
    fileUrl: row.fileUrl,
    externalUrl: row.externalUrl,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    sortOrder: row.sortOrder,
    // Not read by the cards; the rows arrive already in author order.
    createdAt: new Date(0),
  }
}

/**
 * One audience of a lesson (or the whole-module / whole-program teacher rows):
 * the same cards and interactive guide a child gets on the portal, so a teacher
 * opens, downloads and presents exactly what the class sees. A material hidden
 * in this group is not something the class has, so it is left out.
 */
function ReadingSection({
  heading,
  rows,
  emptyLabel = null,
  moduleTitle = null,
  headingLevel = 4,
  canDelete = false,
}: Readonly<{
  heading: string
  rows: StaffMaterialRow[]
  emptyLabel?: string | null
  moduleTitle?: string | null
  headingLevel?: 3 | 4
  /** False on an archived year / for a substitute: nothing is deletable. */
  canDelete?: boolean
}>) {
  const Heading = `h${headingLevel}` as const
  const visible = rows.filter((r) => !r.hiddenInThisGroup)
  const guides = visible.filter((r) => kindOf(r) === 'robocamp')
  const others = visible.filter((r) => kindOf(r) !== 'robocamp').map(toItem)

  // Only this group's own rows, and only the ones the viewer may delete
  // (`canEdit` is server-computed: GROUP scope, own upload or admin of the city).
  const deletable = new Set(
    canDelete ? visible.filter((r) => r.scope === 'GROUP' && r.canEdit === true).map((r) => r.id) : [],
  )
  const deleteFor = (item: { id: string; title: string }) =>
    deletable.has(item.id) ? <DeleteMaterialButton id={item.id} title={item.title} /> : null

  return (
    <section className="space-y-3">
      <Heading className="text-xs font-semibold uppercase tracking-wide text-gray-500">{heading}</Heading>
      {visible.length === 0 && emptyLabel ? <p className="text-sm text-gray-500">{emptyLabel}</p> : null}
      {guides.map((row) => (
        <div key={row.id} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <InteractiveGuide item={toItem(row)} moduleTitle={moduleTitle} headingLevel={4} />
          </div>
          {deleteFor(row)}
        </div>
      ))}
      {others.length > 0 ? <MaterialCards items={others} actionFor={deleteFor} /> : null}
    </section>
  )
}
