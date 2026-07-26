import type { RecommendationKind, SkillLevel } from '@prisma/client'

// ── Skill levels (POČETNO / U RAZVOJU / OSTVARENO) ───────────────────────────

export const SKILL_LEVELS: readonly SkillLevel[] = [
  'POCETNO',
  'U_RAZVOJU',
  'OSTVARENO',
]

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  POCETNO: 'Početno',
  U_RAZVOJU: 'U razvoju',
  OSTVARENO: 'Ostvareno',
}

// Legend text from the association's grading sheet.
export const SKILL_LEVEL_DESCRIPTIONS: Record<SkillLevel, string> = {
  POCETNO: 'Minimalno zamijećenih primjera.',
  U_RAZVOJU: 'Djelomično zamijećenih primjera.',
  OSTVARENO: 'Opsežno zamijećenih primjera.',
}

// ── Skills, grouped into the two rubric categories ───────────────────────────

export type SkillKey =
  | 'slaganje'
  | 'programiranje'
  | 'inovacije'
  | 'suradnja'
  | 'komunikacija'
  | 'zabava'

export const SKILL_KEYS: readonly SkillKey[] = [
  'slaganje',
  'programiranje',
  'inovacije',
  'suradnja',
  'komunikacija',
  'zabava',
]

type SkillDef = { key: SkillKey; label: string; description: string }

type SkillCategory = {
  title: string
  description: string
  skills: SkillDef[]
}

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  {
    title: 'Praktične vještine',
    description:
      'Postignuća vezana za praktični dio unutar projektnih zadataka.',
    skills: [
      {
        key: 'slaganje',
        label: 'Slaganje',
        description:
          'Postojanje točno složenih projekata prema uputama za slaganje.',
      },
      {
        key: 'programiranje',
        label: 'Programiranje',
        description: 'Postojanje točno riješenih programskih zadataka.',
      },
      {
        key: 'inovacije',
        label: 'Inovacije',
        description:
          'Rješavanje problema na kreativan, inovativan i funkcionalan način.',
      },
    ],
  },
  {
    title: 'Timske vještine',
    description:
      'Postignuća vezana za odnos člana prema ostalim članovima i predavaču.',
    skills: [
      {
        key: 'suradnja',
        label: 'Suradnja',
        description:
          'Rad za dobrobit tima, poštivanje i prihvaćanje međusobnih razlika.',
      },
      {
        key: 'komunikacija',
        label: 'Komunikacija',
        description:
          'Učinkovito prezentiranje trenutnih rješenja i informacija s ostalim članovima i predavačem.',
      },
      {
        key: 'zabava',
        label: 'Zabava',
        description: 'Zadovoljstvo i pozitivan stav za vrijeme rada.',
      },
    ],
  },
]

// ── Recommendation (PREPORUKA) ───────────────────────────────────────────────
// A recommendation is either one of the standard SLR courses (kind = COURSE,
// with a courseId) or one of two special tracks.

export const RECOMMENDATION_SPECIALS: readonly {
  kind: Extract<RecommendationKind, 'COMPETITION_PREP' | 'COMPETITION_PROGRAM'>
  label: string
}[] = [
  { kind: 'COMPETITION_PREP', label: 'Priprema za natjecanja' },
  { kind: 'COMPETITION_PROGRAM', label: 'Natjecateljski program' },
]

/**
 * Display label for a stored preporuka: the recommended course's title for
 * COURSE, the canonical special-track label otherwise.
 */
export function formatRecommendationLabel(
  kind: RecommendationKind,
  recommendedCourseTitle: string | null,
): string {
  if (kind === 'COURSE') return recommendedCourseTitle ?? 'Preporučen program'
  return RECOMMENDATION_SPECIALS.find((s) => s.kind === kind)?.label ?? kind
}

/** A single PREPORUKA dropdown option: encoded value + Croatian label. */
export type RecommendationOption = { value: string; label: string }

/**
 * Encodes a stored (kind, courseId) pair into a single select-value string:
 * `course:<id>` for a course recommendation, or the special kind verbatim.
 * Empty string = no recommendation.
 */
export function encodeRecommendation(
  kind: RecommendationKind | null,
  courseId: string | null,
): string {
  if (kind === 'COURSE' && courseId) return `course:${courseId}`
  if (kind === 'COMPETITION_PREP' || kind === 'COMPETITION_PROGRAM') return kind
  return ''
}

/** Inverse of {@link encodeRecommendation}. */
export function decodeRecommendation(value: string): {
  recommendationKind: RecommendationKind | null
  recommendedCourseId: string | null
} {
  if (value.startsWith('course:')) {
    const id = value.slice('course:'.length)
    return id
      ? { recommendationKind: 'COURSE', recommendedCourseId: id }
      : { recommendationKind: null, recommendedCourseId: null }
  }
  if (value === 'COMPETITION_PREP' || value === 'COMPETITION_PROGRAM') {
    return { recommendationKind: value, recommendedCourseId: null }
  }
  return { recommendationKind: null, recommendedCourseId: null }
}
