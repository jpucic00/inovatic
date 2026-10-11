'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MaterialAudience } from '@prisma/client'
import type { LessonEditorContext } from '@/actions/admin/program-materials'
import { createLesson, deleteLesson, updateLesson } from '@/actions/admin/lessons'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import { croatianPlural } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'
import {
  LessonMaterialSection,
  type StagedMaterial,
} from '@/components/material/lesson-material-section'
import { SatPicker } from './sat-picker'

interface Props {
  context: LessonEditorContext
  /** "Nova lekcija" opened from a free sat on the program page. */
  initialSessionNumbers?: number[]
}

/** Mirrors `createLessonSchema.materials.max(40)`. */
const MAX_STAGED = 40

const sameNumbers = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i])

/**
 * The lesson page, for an existing lesson and for "Nova lekcija" alike.
 *
 * The two differ in when a material becomes real. On an existing lesson every
 * file is created the moment its upload finishes — there is a lesson to hang it
 * on. A new lesson has no id yet, so files are only staged here and arrive in
 * the SAME transaction as the lesson ("Spremi lekciju"): either the lesson
 * exists with its files or nothing does.
 */
export function LessonEditor({ context, initialSessionNumbers = [] }: Readonly<Props>) {
  const router = useRouter()
  const { course, module, lesson } = context
  const isNew = lesson === null
  const programHref = `/admin/programi/${course.id}`

  const [title, setTitle] = useState(lesson?.title ?? '')
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [sessionNumbers, setSessionNumbers] = useState<number[]>(
    lesson?.sessionNumbers ?? initialSessionNumbers,
  )
  const [teacherStaged, setTeacherStaged] = useState<StagedMaterial[]>([])
  const [studentStaged, setStudentStaged] = useState<StagedMaterial[]>([])
  const [isSaving, startSaving] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  // Enter in the title submits the form, and a second Enter can land before the
  // pending state re-renders (or after it ends, while the redirect is still on
  // its way) — on an undated program that was a second identical lesson.
  const creating = useRef(false)

  const titleValid = title.trim().length >= 2
  const dirty =
    !isNew &&
    (title.trim() !== lesson.title ||
      (description.trim() || null) !== (lesson.description ?? null) ||
      !sameNumbers(sessionNumbers, lesson.sessionNumbers))

  const moveLessonOptions = context.siblingLessons.map((s) => ({
    id: s.id,
    label: s.sessionNumbers.length > 0 ? `${formatLessonSessions(s.sessionNumbers)} · ${s.title}` : s.title,
  }))
  const studentReach = isRadionica(course.kind)
    ? 'u svim grupama ove radionice'
    : 'u svim grupama ovog programa, u oba grada'
  // A radionica belongs to one city as a whole, so "Samo za <grad>" means
  // nothing there; a shared program's curriculum is where it applies.
  const cityControls = isRadionica(course.kind) ? null : { viewerCity: context.viewerCity }

  // ── Save ──────────────────────────────────────────────────────────────────

  const allStaged = [
    ...teacherStaged.map((m) => ({ ...m, audience: 'TEACHER' as MaterialAudience })),
    ...studentStaged.map((m) => ({ ...m, audience: 'STUDENT' as MaterialAudience })),
  ]
  let blockReason: string | null = null
  if (!titleValid) blockReason = 'Upišite naziv lekcije (barem 2 znaka).'
  else if (allStaged.some((m) => m.status === 'uploading')) blockReason = 'Pričekajte da se datoteke učitaju.'
  else if (allStaged.some((m) => m.status === 'error')) blockReason = 'Uklonite datoteke koje se nisu učitale.'
  else if (allStaged.some((m) => m.title.trim().length < 2)) blockReason = 'Svaki materijal treba naslov od barem 2 znaka.'
  else if (allStaged.length > MAX_STAGED) blockReason = `Najviše ${MAX_STAGED} materijala odjednom — ostale dodajte nakon spremanja.`

  const saveNew = () => {
    if (blockReason || creating.current) return
    creating.current = true
    startSaving(async () => {
      const res = await createLesson({
        courseId: course.id,
        moduleId: module?.id ?? null,
        title: title.trim(),
        description: description.trim() || null,
        sessionNumbers: context.dated ? sessionNumbers : [],
        materials: allStaged.map((m) => ({
          audience: m.audience,
          title: m.title.trim(),
          description: null,
          type: m.type,
          fileUrl: m.fileUrl,
          externalUrl: m.externalUrl,
          fileSize: m.fileSize,
          mimeType: m.mimeType,
        })),
      }).catch(() => ({ success: false as const, error: 'Spremanje nije uspjelo. Provjerite vezu i pokušajte ponovno.' }))
      if (res.success) {
        toast.success('Lekcija spremljena.')
        router.replace(`${programHref}/lekcija/${res.lessonId}`)
      } else {
        creating.current = false
        toast.error(res.error)
      }
    })
  }

  const saveExisting = () => {
    if (isNew || !titleValid || !dirty || isSaving) return
    startSaving(async () => {
      const res = await updateLesson({
        id: lesson.id,
        title: title.trim(),
        description: description.trim() || null,
        sessionNumbers: context.dated ? sessionNumbers : [],
      })
      if (res.success) {
        toast.success('Lekcija spremljena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const remove = () => {
    if (isNew) return
    const ok = globalThis.confirm(`Obrisati lekciju „${lesson.title}"? Ova radnja je nepovratna.`)
    if (!ok) return
    startDeleting(async () => {
      const res = await deleteLesson(lesson.id)
      if (res.success) {
        toast.success('Lekcija obrisana.')
        router.replace(programHref)
      } else {
        toast.error(res.error)
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const where = module?.title ?? course.title
  const fieldClass =
    'w-full px-3 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
  const undatedHint = isRadionica(course.kind)
    ? 'Radionica nema numerirane sate — lekcije se redaju redom kojim su dodane.'
    : 'Natjecanja nemaju numerirane termine — lekcije se redaju redom kojim su dodane.'

  return (
    <div className="max-w-3xl pb-24 sm:pb-0">
      <Link
        href={programHref}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline sm:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" />
        Natrag na {course.title}
      </Link>

      <header className="mb-6">
        <p className="text-sm text-gray-500">
          {where}
          {isNew ? '' : ' · Lekcija'}
        </p>
        <h1 className="mt-0.5 break-words text-2xl font-bold text-gray-900">
          {isNew ? 'Nova lekcija' : lesson.title}
        </h1>
        {!isNew && lesson.sessionNumbers.length > 0 ? (
          <p className="mt-1 text-sm text-gray-600">{formatLessonSessions(lesson.sessionNumbers)}</p>
        ) : null}
      </header>

      <form
        className="mb-8 space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (isNew) saveNew()
          else saveExisting()
        }}
      >
        <div>
          <label htmlFor="lesson-title" className="mb-1.5 block text-sm font-medium text-gray-700">
            Naziv <span className="text-red-500">*</span>
          </label>
          <input
            id="lesson-title"
            type="text"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="npr. Prvi pokreti robota"
            className={`${fieldClass} h-11 sm:h-10`}
          />
        </div>
        <div>
          <label htmlFor="lesson-description" className="mb-1.5 block text-sm font-medium text-gray-700">
            Opis
          </label>
          <textarea
            id="lesson-description"
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Što djeca rade na ovoj lekciji (neobavezno)"
            className={`${fieldClass} py-2`}
          />
        </div>

        <div>
          <p className="mb-1.5 block text-sm font-medium text-gray-700">Sati</p>
          {context.dated ? (
            <SatPicker
              selected={sessionNumbers}
              onChange={setSessionNumbers}
              isFirstModule={context.isFirstModule}
              taken={context.takenSessions}
              satDates={context.satDates}
              disabled={isSaving}
            />
          ) : (
            <p className="text-sm text-gray-500">{undatedHint}</p>
          )}
        </div>

        {isNew ? null : (
          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={remove}
              disabled={isDeleting || isSaving}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 sm:min-h-10"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Obriši lekciju
            </button>
            <button
              type="submit"
              disabled={!dirty || !titleValid || isSaving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Spremi
            </button>
          </div>
        )}
      </form>

      {!isNew && context.groupMaterialCount > 0 ? (
        <p className="mb-6 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Grupe imaju još {context.groupMaterialCount}{' '}
          {croatianPlural(context.groupMaterialCount, 'vlastiti materijal', 'vlastita materijala', 'vlastitih materijala')}{' '}
          u ovoj lekciji — vide se na stranici svake grupe.
        </p>
      ) : null}

      <div className="space-y-8">
        <LessonMaterialSection
          audience="TEACHER"
          heading="Materijali za nastavnike"
          hint="Priprema i ono što nastavnik prezentira — polaznici ih ne vide."
          rows={context.teacherMaterials}
          emptyLabel="Još nema materijala za nastavnike."
          add={
            isNew
              ? { mode: 'stage', staged: teacherStaged, setStaged: setTeacherStaged }
              : { mode: 'create', target: { scope: 'LESSON', lessonId: lesson.id } }
          }
          canMoveAudience
          moveLessonOptions={moveLessonOptions}
          studentReach={studentReach}
          cityControls={cityControls}
        />
        <LessonMaterialSection
          audience="STUDENT"
          heading="Materijali za polaznike"
          hint="Vide ih djeca i roditelji na portalu i na računalu u učionici."
          rows={context.studentMaterials}
          emptyLabel="Još nema materijala za polaznike."
          add={
            isNew
              ? { mode: 'stage', staged: studentStaged, setStaged: setStudentStaged }
              : { mode: 'create', target: { scope: 'LESSON', lessonId: lesson.id } }
          }
          canMoveAudience
          moveLessonOptions={moveLessonOptions}
          studentReach={studentReach}
          cityControls={cityControls}
        />
      </div>

      {isNew ? (
        // Pinned to the bottom on a phone: the button would otherwise sit
        // under every staged file, a long scroll away from the title above.
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {blockReason ? <p className="text-xs text-gray-500 sm:mr-auto">{blockReason}</p> : null}
            <button
              type="button"
              onClick={saveNew}
              disabled={blockReason !== null || isSaving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Spremi lekciju
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
