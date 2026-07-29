import type { ProgramKind, SkillLevel } from '@prisma/client'
import { Award } from 'lucide-react'
import {
  skillCategories,
  SKILL_LEVELS,
  SKILL_LEVEL_BADGE_CLASS,
  SKILL_LEVEL_DESCRIPTIONS,
  SKILL_LEVEL_LABELS,
  type SkillKey,
} from '@/lib/assessment-rubric'
import type { StudentAssessmentReadonly } from '@/actions/student/assessment'

/**
 * One skill row: the three levels rendered as chips with the achieved one
 * filled. Showing all three (instead of only the result) keeps the scale
 * visible, so a parent can read the level without a separate legend lookup.
 */
function SkillRow({
  label,
  description,
  value,
}: Readonly<{ label: string; description: string; value: SkillLevel | null }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-gray-700" title={description}>
        {label}
      </span>
      {value === null ? (
        <span className="text-xs text-gray-400">Nije ocijenjeno</span>
      ) : (
        // The chips are a picture of one value and are all aria-hidden, so
        // without help a parent's screen reader announced the six skill names
        // with no grades attached. An `aria-label` on the wrapper does not fix
        // it — on a plain <div> (implicit role `generic`) ARIA forbids the
        // attribute and browsers drop it — and `role="img"` only trades that
        // for a rule against faking an image. Real text in the accessibility
        // tree is what actually works, and it needs no role at all.
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200">
          <span className="sr-only">{`${label}: ${SKILL_LEVEL_LABELS[value]}`}</span>
          {SKILL_LEVELS.map((level, i) => (
            <span
              key={level}
              aria-hidden="true"
              className={[
                'px-2.5 py-1 text-xs font-medium',
                i > 0 ? 'border-l border-gray-200' : '',
                level === value
                  ? SKILL_LEVEL_BADGE_CLASS[level]
                  : 'bg-white text-gray-400',
              ].join(' ')}
            >
              {SKILL_LEVEL_LABELS[level]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Read-only report card for the student portal — no editing, no bilješke. */
export function AssessmentReadonly({
  assessment,
  kind,
}: Readonly<{ assessment: StudentAssessmentReadonly; kind: ProgramKind }>) {
  const skills: Record<SkillKey, SkillLevel | null> = {
    slaganje: assessment.slaganje,
    programiranje: assessment.programiranje,
    razradaIdeja: assessment.razradaIdeja,
    izvedivost: assessment.izvedivost,
    inovacije: assessment.inovacije,
    suradnja: assessment.suradnja,
    komunikacija: assessment.komunikacija,
    zabava: assessment.zabava,
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="space-y-5 p-4 sm:p-6">
        <p className="text-xs text-gray-500">
          {SKILL_LEVELS.map(
            (l) =>
              `${SKILL_LEVEL_LABELS[l]} — ${SKILL_LEVEL_DESCRIPTIONS[l].replace(/\.$/, '').toLowerCase()}`,
          ).join(' · ')}
        </p>

        {skillCategories(kind).map((category) => (
          <section key={category.title} className="space-y-2">
            <h2
              className="text-xs font-semibold uppercase tracking-wide text-gray-700"
              title={category.description}
            >
              {category.title}
            </h2>
            <div className="space-y-2">
              {category.skills.map((skill) => (
                <SkillRow
                  key={skill.key}
                  label={skill.label}
                  description={skill.description}
                  value={skills[skill.key]}
                />
              ))}
            </div>
          </section>
        ))}

        {assessment.opisnaOcjena?.trim() ? (
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
              Opisna ocjena
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {assessment.opisnaOcjena}
            </p>
          </section>
        ) : null}

        {assessment.recommendationLabel ? (
          <section className="flex items-start gap-3 rounded-lg bg-cyan-50 p-3">
            <Award className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-600" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
                Preporuka mentora
              </h2>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {assessment.recommendationLabel}
              </p>
            </div>
          </section>
        ) : null}

        <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
          Ocijenio: {assessment.authorName} ·{' '}
          {assessment.updatedAtLabel}
        </p>
      </div>
    </div>
  )
}
