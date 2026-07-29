'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SkillLevel, ProgramKind } from '@prisma/client'
import {
  skillCategories,
  skillKeysFor,
  SKILL_LEVELS,
  SKILL_LEVEL_DESCRIPTIONS,
  SKILL_LEVEL_LABELS,
  decodeRecommendation,
  encodeRecommendation,
  type RecommendationOption,
  type SkillKey,
} from '@/lib/assessment-rubric'
import type {
  AssessmentSaveInput,
  AssessmentValue,
} from '@/lib/student-assessment-view'
import { SkillLevelControl } from './skill-level-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdminActionResult } from '@/lib/action-types'
import { formatDate } from '@/lib/format'

type Skills = Record<SkillKey, SkillLevel | null>

// Every skill column, so a card can be built for either rubric; only the ones
// this group's kind uses are rendered and saved.
const EMPTY_SKILLS: Skills = {
  slaganje: null,
  programiranje: null,
  razradaIdeja: null,
  izvedivost: null,
  inovacije: null,
  suradnja: null,
  komunikacija: null,
  zabava: null,
}

const NONE_VALUE = '__none__'

function skillsFrom(initial: AssessmentValue | null): Skills {
  if (!initial) return { ...EMPTY_SKILLS }
  return {
    slaganje: initial.slaganje,
    programiranje: initial.programiranje,
    razradaIdeja: initial.razradaIdeja,
    izvedivost: initial.izvedivost,
    inovacije: initial.inovacije,
    suradnja: initial.suradnja,
    komunikacija: initial.komunikacija,
    zabava: initial.zabava,
  }
}

interface Props {
  studentId: string
  groupId: string
  /** Which rubric to render — the practical skills differ by program kind. */
  kind: ProgramKind
  initial: AssessmentValue | null
  recommendationOptions: RecommendationOption[]
  onSave: (input: AssessmentSaveInput) => Promise<AdminActionResult>
  onClear: (input: {
    studentId: string
    groupId: string
  }) => Promise<AdminActionResult>
}

export function AssessmentCard({
  studentId,
  groupId,
  kind,
  initial,
  recommendationOptions,
  onSave,
  onClear,
}: Readonly<Props>) {
  const [skills, setSkills] = useState<Skills>(() => skillsFrom(initial))
  const [opisna, setOpisna] = useState(initial?.opisnaOcjena ?? '')
  const [rec, setRec] = useState(() =>
    encodeRecommendation(
      initial?.recommendationKind ?? null,
      initial?.recommendedCourseId ?? null,
    ),
  )
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const baseline = useMemo(
    () => ({
      skills: skillsFrom(initial),
      opisna: initial?.opisnaOcjena ?? '',
      rec: encodeRecommendation(
        initial?.recommendationKind ?? null,
        initial?.recommendedCourseId ?? null,
      ),
    }),
    [initial],
  )

  const dirty = useMemo(() => {
    if (opisna !== baseline.opisna) return true
    if (rec !== baseline.rec) return true
    return skillKeysFor(kind).some((k) => skills[k] !== baseline.skills[k])
  }, [skills, opisna, rec, baseline])

  const setSkill = (key: SkillKey, value: SkillLevel | null) =>
    setSkills((prev) => ({ ...prev, [key]: value }))

  const runSave = () => {
    if (!dirty || isPending) return
    const { recommendationKind, recommendedCourseId } = decodeRecommendation(rec)
    startTransition(async () => {
      const result = await onSave({
        studentId,
        groupId,
        ...skills,
        opisnaOcjena: opisna.trim() || null,
        recommendationKind,
        recommendedCourseId,
      })
      if (result.success) {
        toast.success('Ocjena spremljena.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri spremanju.')
      }
    })
  }

  const runClear = () => {
    if (isPending) return
    if (!globalThis.confirm('Poništiti ocjenu za ovu grupu?')) return
    startTransition(async () => {
      const result = await onClear({ studentId, groupId })
      if (result.success) {
        toast.success('Ocjena poništena.')
        setSkills({ ...EMPTY_SKILLS })
        setOpisna('')
        setRec('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri brisanju.')
      }
    })
  }

  const authorSuffix = initial?.authorName ? ` · ${initial.authorName}` : ''
  const savedLine = initial?.updatedAt
    ? `Spremljeno ${formatDate(new Date(initial.updatedAt))}${authorSuffix}`
    : 'Još nije ocijenjeno'

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="space-y-5 p-4">
        {/* Level legend */}
        <p className="text-xs text-gray-500">
          {SKILL_LEVELS.map(
            (l) => `${SKILL_LEVEL_LABELS[l]} — ${SKILL_LEVEL_DESCRIPTIONS[l].replace(/\.$/, '').toLowerCase()}`,
          ).join(' · ')}
        </p>

        {skillCategories(kind).map((category) => (
          <fieldset key={category.title} className="space-y-2">
            <legend
              className="text-xs font-semibold uppercase tracking-wide text-gray-700"
              title={category.description}
            >
              {category.title}
            </legend>
            <div className="space-y-2">
              {category.skills.map((skill) => (
                <div
                  key={skill.key}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span
                    className="text-sm text-gray-700"
                    title={skill.description}
                  >
                    {skill.label}
                  </span>
                  <SkillLevelControl
                    label={skill.label}
                    value={skills[skill.key]}
                    onChange={(v) => setSkill(skill.key, v)}
                    disabled={isPending}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        {/* Opisna ocjena */}
        <div>
          <label
            htmlFor={`opisna-${groupId}`}
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700"
          >
            Opisna ocjena
          </label>
          <textarea
            id={`opisna-${groupId}`}
            value={opisna}
            onChange={(e) => setOpisna(e.target.value)}
            disabled={isPending}
            rows={3}
            maxLength={5000}
            placeholder="Opisna ocjena polaznika..."
            className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
          />
        </div>

        {/* Preporuka */}
        <div className="max-w-xs">
          <label
            htmlFor={`preporuka-${groupId}`}
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700"
          >
            Preporuka
          </label>
          <Select
            value={rec || NONE_VALUE}
            onValueChange={(v) => setRec(v === NONE_VALUE ? '' : v)}
            disabled={isPending}
          >
            <SelectTrigger id={`preporuka-${groupId}`} className="w-full">
              <SelectValue placeholder="Bez preporuke" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Bez preporuke</SelectItem>
              {recommendationOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-400">{savedLine}</span>
          <div className="flex items-center gap-2">
            {initial ? (
              <button
                type="button"
                onClick={runClear}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                Poništi
              </button>
            ) : null}
            <button
              type="button"
              onClick={runSave}
              disabled={!dirty || isPending}
              className="rounded-md bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
            >
              {isPending ? 'Spremam...' : 'Spremi ocjenu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
