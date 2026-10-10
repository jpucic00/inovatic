import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getLessonEditorContext } from '@/actions/admin/program-materials'
import { PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'
import { LessonEditor } from '@/components/admin/lessons/lesson-editor'

export const metadata: Metadata = { title: 'Admin – Nova lekcija' }

interface PageProps {
  params: Promise<{ courseId: string }>
  /** `modul` — absent for a radionica; `sat` — the free sat it was opened from. */
  searchParams: Promise<{ modul?: string | string[]; sat?: string | string[] }>
}

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function NewLessonPage({ params, searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const { courseId } = await params
  const query = await searchParams
  const moduleId = single(query.modul) || null

  // notFound() for a module of another program, or a missing one on a program
  // that has modules — so a hand-edited link cannot open a lesson nowhere.
  const context = await getLessonEditorContext(courseId, { moduleId })

  // The free-sat shortcut preselects that sat, but only one this module really
  // has and nobody holds yet; anything else just opens with nothing picked.
  const satParam = single(query.sat)
  const sat = satParam ? Number(satParam) : Number.NaN
  const satAllowed =
    context.dated &&
    Number.isInteger(sat) &&
    ((sat >= 1 && sat <= 7) || (sat === PROBNI_SAT_SESSION && context.isFirstModule)) &&
    !context.takenSessions.some((t) => t.sessionNumber === sat)

  return (
    <LessonEditor
      key={`${moduleId ?? 'program'}-${satAllowed ? sat : ''}`}
      context={context}
      initialSessionNumbers={satAllowed ? [sat] : []}
    />
  )
}
