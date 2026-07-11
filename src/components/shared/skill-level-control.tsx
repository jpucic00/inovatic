'use client'

import type { SkillLevel } from '@prisma/client'
import { SKILL_LEVELS, SKILL_LEVEL_LABELS } from '@/lib/assessment-rubric'

const ACTIVE_CLASS: Record<SkillLevel, string> = {
  POCETNO: 'bg-amber-500 text-white',
  U_RAZVOJU: 'bg-sky-500 text-white',
  OSTVARENO: 'bg-emerald-500 text-white',
}

interface Props {
  value: SkillLevel | null
  onChange: (value: SkillLevel | null) => void
  disabled?: boolean
}

/**
 * Three-segment control for a single skill (Početno / U razvoju / Ostvareno).
 * Clicking the active segment again clears it (back to "not graded").
 */
export function SkillLevelControl({
  value,
  onChange,
  disabled,
}: Readonly<Props>) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md border border-gray-200"
      role="group"
    >
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
                ? ACTIVE_CLASS[level]
                : 'bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {SKILL_LEVEL_LABELS[level]}
          </button>
        )
      })}
    </div>
  )
}
