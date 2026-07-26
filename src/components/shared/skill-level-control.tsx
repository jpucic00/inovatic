'use client'

import type { SkillLevel } from '@prisma/client'
import {
  SKILL_LEVELS,
  SKILL_LEVEL_BADGE_CLASS,
  SKILL_LEVEL_LABELS,
} from '@/lib/assessment-rubric'

interface Props {
  /** Skill name announced to assistive tech (the visible label sits outside). */
  label: string
  value: SkillLevel | null
  onChange: (value: SkillLevel | null) => void
  disabled?: boolean
}

/**
 * Three-segment control for a single skill (Početno / U razvoju / Ostvareno).
 * Clicking the active segment again clears it (back to "not graded").
 */
export function SkillLevelControl({
  label,
  value,
  onChange,
  disabled,
}: Readonly<Props>) {
  return (
    <fieldset className="inline-flex overflow-hidden rounded-md border border-gray-200">
      <legend className="sr-only">{label}</legend>
      {SKILL_LEVELS.map((level, i) => {
        const isActive = value === level
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : level)}
            className={[
              'px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              i > 0 ? 'border-l border-gray-200' : '',
              isActive
                ? SKILL_LEVEL_BADGE_CLASS[level]
                : 'bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {SKILL_LEVEL_LABELS[level]}
          </button>
        )
      })}
    </fieldset>
  )
}
