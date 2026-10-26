import { BookOpen } from 'lucide-react'
import type { GroupMaterialsView } from '@/lib/group-materials-view'
import { CurrentLessonCard, formatDayMonth, LessonAccordion } from './lesson-accordion'

/**
 * The Materijali panel: the group's material, structured module → lesson.
 *
 * What a section is depends on the program, and the server already decided it:
 * a standard group gets the one module it is working through now (whole, every
 * lesson), a natjecanje group one section per natjecanje, a radionica a single
 * section with no module at all. Other modules of a standard program stay out
 * of the payload, so they cannot leak here.
 *
 * A section without lessons is dropped rather than shown empty — in practice
 * that is a natjecanje nobody has prepared yet, and a heading with nothing
 * under it reads as a broken page to a child. Only when no section has a
 * lesson does the panel fall back to the "not published yet" state.
 *
 * A parent's view (`currentLessonOnly`) holds just the current lesson of each
 * dated section, shown as one open card; before the first lesson starts the
 * section says when it does instead. Undated sections (radionica, a natjecanje
 * without sats) keep the accordion of every lesson.
 */
export function MaterialList({ view }: Readonly<{ view: GroupMaterialsView }>) {
  const sections = view.modules.filter(
    (section) => section.lessons.length > 0 || (view.currentLessonOnly && section.firstLessonStart),
  )

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-11 text-center">
        <span className="mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
          <BookOpen className="h-7 w-7" />
        </span>
        <p className="mb-1 text-base font-semibold text-gray-900">
          Materijali još nisu objavljeni
        </p>
        <p className="text-sm text-gray-500">
          Mentor ih dodaje kad krene modul. Javit ćemo ti se na satu.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.moduleId ?? 'program'} aria-label={section.title ?? 'Lekcije'}>
          {section.title ? (
            <div className="mb-3">
              {/* Only a standard program has ONE module it is "on"; naming it
                  tells a parent why the other modules are not listed. */}
              {section.isActive ? (
                <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
                  Trenutni modul
                </p>
              ) : null}
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
            </div>
          ) : null}
          <SectionLessons section={section} currentLessonOnly={view.currentLessonOnly} />
        </section>
      ))}
    </div>
  )
}

function SectionLessons({
  section,
  currentLessonOnly,
}: Readonly<{ section: GroupMaterialsView['modules'][number]; currentLessonOnly: boolean }>) {
  if (!currentLessonOnly || !section.dated) {
    return <LessonAccordion lessons={section.lessons} currentLessonId={section.currentLessonId} />
  }
  const [lesson] = section.lessons
  if (lesson) return <CurrentLessonCard lesson={lesson} />
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <p className="text-sm font-semibold text-gray-900">
        {section.firstLessonStart
          ? `Prva lekcija počinje ${formatDayMonth(section.firstLessonStart)}`
          : 'Lekcija još nije počela'}
      </p>
      <p className="mt-1 text-sm text-gray-500">Materijali se pojavljuju na dan sata.</p>
    </div>
  )
}
