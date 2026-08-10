'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Check, X, GraduationCap, RotateCcw } from 'lucide-react'
import {
  ELEMENTARY_GRADE_VALUES,
  GRADE_LABELS,
  type ElementaryGrade,
} from '@/lib/inquiry-status'
import {
  resetCourseGradeRule,
  upsertCourseGradeRule,
} from '@/actions/admin/course-grade-rule'

interface Props {
  courseId: string
  schoolYear: string
  /** Saved override, or null when the program still follows the default ladder. */
  grades: ElementaryGrade[] | null
  /** What the default ladder offers this program — shown when `grades` is null. */
  defaults: ElementaryGrade[]
  editable: boolean
}

/** Grade list in razred order, as "5., 6., 7. razred". */
function formatGrades(grades: readonly ElementaryGrade[]): string {
  if (grades.length === 0) return '–'
  return ELEMENTARY_GRADE_VALUES.filter((g) => grades.includes(g))
    .map((g) => GRADE_LABELS[g])
    .join(', ')
}

export function CourseGradesEditor({
  courseId,
  schoolYear,
  grades,
  defaults,
  editable,
}: Readonly<Props>) {
  const [editing, setEditing] = useState(false)
  // Editing always starts from the effective set, so ticking one extra razred
  // onto a defaulted program does not silently drop the ones it already had.
  const [draft, setDraft] = useState<ElementaryGrade[]>(grades ?? defaults)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const custom = grades !== null
  const effective = grades ?? defaults

  const toggle = (grade: ElementaryGrade) => {
    setDraft((current) =>
      current.includes(grade) ? current.filter((g) => g !== grade) : [...current, grade],
    )
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await upsertCourseGradeRule({ courseId, schoolYear, grades: draft })
      if (result.success) {
        toast.success('Razredi spremljeni.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleReset = () => {
    startTransition(async () => {
      const result = await resetCourseGradeRule({ courseId, schoolYear })
      if (result.success) {
        toast.success('Vraćeno na zadano.')
        setDraft(defaults)
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCancel = () => {
    setDraft(effective)
    setEditing(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GraduationCap className="w-5 h-5 text-cyan-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Razredi</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Koji razredi na prijavnici vide termine ovog programa u školskoj godini{' '}
              {schoolYear}.
            </p>
          </div>
        </div>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors shrink-0"
            title="Uredi razrede"
          >
            <Pencil className="w-3.5 h-3.5" />
            Uredi
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ELEMENTARY_GRADE_VALUES.map((g) => (
              <label
                key={g}
                htmlFor={`grade-${g}`}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  id={`grade-${g}`}
                  type="checkbox"
                  checked={draft.includes(g)}
                  onChange={() => toggle(g)}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                {GRADE_LABELS[g]}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Isti razred može voditi na više programa — tada prijavnica nudi termine svih
            njih. Bez ijednog razreda program se ne nudi na javnoj prijavnici.
          </p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={handleReset}
              disabled={isPending || !custom}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={custom ? 'Obriši prilagodbu' : 'Program već koristi zadane razrede'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Vrati na zadano
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Odustani
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {isPending ? 'Spremam...' : 'Spremi'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className={custom ? 'font-medium text-amber-700' : 'font-medium text-gray-500'}>
              {custom ? 'Prilagođeno' : 'Zadano'}
            </span>
            <span className="text-gray-500">{formatGrades(effective)}</span>
          </div>
          {custom && effective.length === 0 && (
            <p className="text-xs text-amber-700">
              Program se ne nudi nijednom razredu na javnoj prijavnici.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
