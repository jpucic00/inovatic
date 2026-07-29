import type { ProgramKind, RecommendationKind, SkillLevel } from '@prisma/client'
// Relative on purpose: the evaluation e-mail template imports this module for
// its rubric, and `emails/` is outside the `@/*` alias root.
import { isCompetition } from './program-kind'

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

// Filled-chip classes for one level — shared by the staff three-segment control
// and the read-only portal card so both read the same at a glance.
export const SKILL_LEVEL_BADGE_CLASS: Record<SkillLevel, string> = {
  POCETNO: 'bg-amber-500 text-white',
  U_RAZVOJU: 'bg-sky-500 text-white',
  OSTVARENO: 'bg-emerald-500 text-white',
}

/**
 * The same three chips as literal colors, for the report card rendered inside an
 * e-mail — mail clients have no Tailwind, so the classes above cannot be reused
 * there. Hexes are the Tailwind v4 values of amber-500 / sky-500 / emerald-500;
 * a unit test asserts both maps cover every level, so a new level cannot land
 * styled in the app and unstyled in the inbox.
 */
export const SKILL_LEVEL_BADGE_STYLE: Record<
  SkillLevel,
  { backgroundColor: string; color: string }
> = {
  POCETNO: { backgroundColor: '#f59e0b', color: '#ffffff' },
  U_RAZVOJU: { backgroundColor: '#0ea5e9', color: '#ffffff' },
  OSTVARENO: { backgroundColor: '#10b981', color: '#ffffff' },
}

// ── Skills, grouped into the two rubric categories ───────────────────────────

export type SkillKey =
  // Praktične vještine — STANDARD
  | 'slaganje'
  | 'programiranje'
  // Praktične vještine — COMPETITION
  | 'razradaIdeja'
  | 'izvedivost'
  // Praktične vještine — both rubrics
  | 'inovacije'
  // Timske vještine — both rubrics
  | 'suradnja'
  | 'komunikacija'
  | 'zabava'

/**
 * Every skill any rubric can hold. Use this only where you genuinely mean "all
 * columns" (clearing a card, nulling what a kind doesn't use);
 * {@link skillKeysFor} is what a form or a diff should iterate.
 */
export const SKILL_KEYS: readonly SkillKey[] = [
  'slaganje',
  'programiranje',
  'razradaIdeja',
  'izvedivost',
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

const INOVACIJE: SkillDef = {
  key: 'inovacije',
  label: 'Inovacije',
  description:
    'Rješavanje problema na kreativan, inovativan i funkcionalan način.',
}

/** PRAKTIČNE VJEŠTINE as graded on the SLR curriculum. */
const STANDARD_PRACTICAL: SkillCategory = {
  title: 'Praktične vještine',
  description: 'Postignuća vezana za praktični dio unutar projektnih zadataka.',
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
    INOVACIJE,
  ],
}

/**
 * PRAKTIČNE VJEŠTINE as graded on the Natjecateljski program. Competitors are
 * judged on the idea and its realisation rather than on following build and
 * programming instructions, so the first two skills differ; Inovacije is the
 * one practical skill both rubrics share.
 */
const COMPETITION_PRACTICAL: SkillCategory = {
  title: 'Praktične vještine',
  description: 'Postignuća vezana za praktični dio unutar projektnih zadataka.',
  skills: [
    {
      key: 'razradaIdeja',
      label: 'Razrada ideja',
      description:
        'Postojanje inovativnih ideja, odabiranje jedne od njih te izrada plana kako je razviti / usavršiti.',
    },
    {
      key: 'izvedivost',
      label: 'Izvedivost',
      description:
        'Razvijanje vlastite izvorne ideje ili nadovezivanje na već postojeću, te uz pomoć prototipa modela predstavljanje rješenja.',
    },
    INOVACIJE,
  ],
}

/** TIMSKE VJEŠTINE — identical in both rubrics. */
const TEAM_SKILLS: SkillCategory = {
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
}

/**
 * The rubric a group's report card renders, by program kind. Radionice are
 * never graded at all (`isGradable`), so they never reach this.
 */
export function skillCategories(kind: ProgramKind): readonly SkillCategory[] {
  return [
    isCompetition(kind) ? COMPETITION_PRACTICAL : STANDARD_PRACTICAL,
    TEAM_SKILLS,
  ]
}

/** The skills that rubric actually holds — what a form or a diff iterates. */
export function skillKeysFor(kind: ProgramKind): readonly SkillKey[] {
  return skillCategories(kind).flatMap((c) => c.skills.map((s) => s.key))
}

// ── Is this card actually filled in? ─────────────────────────────────────────

/** Every column the two predicates below read. */
type AssessmentState = Record<SkillKey, SkillLevel | null> & {
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
}

/**
 * A row that exists but says nothing — every skill null, no opisna ocjena, no
 * preporuka. `upsertStudentAssessment` will happily save one (a mentor opening
 * and saving the card without grading), so "has a row" is not the same as
 * "graded".
 *
 * This is the app-wide definition of ungraded: the portal shows "not graded
 * yet" rather than an empty card, and an evaluation e-mail campaign skips the
 * child by name instead of mailing a blank card to their parent. One rule, so
 * the two can never disagree about who has been graded.
 */
export function isBlankAssessment(row: AssessmentState): boolean {
  return (
    SKILL_KEYS.every((key) => row[key] === null) &&
    !row.opisnaOcjena?.trim() &&
    row.recommendationKind === null
  )
}

/**
 * Every skill this group's rubric holds has a level. Opisna ocjena and preporuka
 * are deliberately not required — both are nullable on the staff card, and a
 * mentor may legitimately leave them off.
 *
 * Only advisory: a partially graded card is still sent (it carries real
 * information, and the missing skills render as "Nije ocijenjeno" exactly as
 * they do in the portal), but the composer flags it so the admin can finish it
 * first. Blankness above is the only hard rule.
 */
export function isCompleteAssessment(kind: ProgramKind, row: AssessmentState): boolean {
  return skillKeysFor(kind).every((key) => row[key] !== null)
}

// ── Recommendation (PREPORUKA) ───────────────────────────────────────────────
// A recommendation is either one of the standard SLR courses (kind = COURSE,
// with a courseId) or one of the special tracks below.

/** Every preporuka that is a track rather than a Course row. */
type SpecialRecommendationKind = Exclude<RecommendationKind, 'COURSE'>

/**
 * The special tracks, in dropdown order. Adding one is a single entry here plus
 * the enum value — `encodeRecommendation`/`decodeRecommendation` and every
 * dropdown read from this list, and a unit test asserts no enum member is
 * missing from it.
 *
 * The competitive program appears both as a whole and per team: a mentor
 * recommending FLL or WRO is naming the team the child should join, which the
 * program-level entry cannot express (the teams are separate groups).
 */
export const RECOMMENDATION_SPECIALS: readonly {
  kind: SpecialRecommendationKind
  label: string
}[] = [
  { kind: 'COMPETITION_PREP', label: 'Priprema za natjecanja' },
  { kind: 'COMPETITION_PROGRAM', label: 'Natjecateljski program' },
  { kind: 'COMPETITION_FLL', label: 'Natjecateljski program – FLL' },
  { kind: 'COMPETITION_WRO', label: 'Natjecateljski program – WRO' },
]

/** Type guard: is this select value one of the special tracks? */
function isSpecialRecommendation(
  value: string,
): value is SpecialRecommendationKind {
  return RECOMMENDATION_SPECIALS.some((s) => s.kind === value)
}

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
  if (kind && isSpecialRecommendation(kind)) return kind
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
  if (isSpecialRecommendation(value)) {
    return { recommendationKind: value, recommendedCourseId: null }
  }
  return { recommendationKind: null, recommendedCourseId: null }
}
