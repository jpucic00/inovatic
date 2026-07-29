import type { City, ProgramKind, RecommendationKind, SkillLevel } from '@prisma/client'
import { formatRecommendationLabel, type SkillKey } from '@/lib/assessment-rubric'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'
import { formatDate } from '@/lib/format'

/**
 * One report card as an evaluation e-mail renders it. Ids are already resolved
 * to display strings — nothing internal reaches a parent's inbox, same rule the
 * portal's read-only card follows.
 */
export type EvaluationCard = {
  childName: string
  /** "SLR 2 – utorkom · Svijet LEGO robotike 2" — which group this card is for. */
  groupLabel: string
  /** Picks the rubric: the practical skills differ between STANDARD and COMPETITION. */
  kind: ProgramKind
  skills: Record<SkillKey, SkillLevel | null>
  opisnaOcjena: string | null
  recommendationLabel: string | null
  authorName: string
  updatedAtLabel: string
}

/** The columns {@link toEvaluationCard} reads off a `StudentAssessment` row. */
export type EvaluationCardRow = {
  id: string
  slaganje: SkillLevel | null
  programiranje: SkillLevel | null
  razradaIdeja: SkillLevel | null
  izvedivost: SkillLevel | null
  inovacije: SkillLevel | null
  suradnja: SkillLevel | null
  komunikacija: SkillLevel | null
  zabava: SkillLevel | null
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
  recommendedCourse: { title: string } | null
  updatedAt: Date
  author: { firstName: string; lastName: string }
  student: { firstName: string; lastName: string }
  group: { name: string | null; course: { title: string; kind: ProgramKind } }
}

/**
 * The eight skill columns picked off a wider row — what the rubric iterates.
 * Typed on the columns alone so any query selecting them qualifies, not just a
 * full card row.
 */
function assessmentSkills(
  row: Record<SkillKey, SkillLevel | null>,
): Record<SkillKey, SkillLevel | null> {
  return {
    slaganje: row.slaganje,
    programiranje: row.programiranje,
    razradaIdeja: row.razradaIdeja,
    izvedivost: row.izvedivost,
    inovacije: row.inovacije,
    suradnja: row.suradnja,
    komunikacija: row.komunikacija,
    zabava: row.zabava,
  }
}

/** A group's display label: its own name plus the program it belongs to. */
function groupLabel(row: EvaluationCardRow): string {
  return [row.group.name, row.group.course.title].filter(Boolean).join(' · ')
}

export function toEvaluationCard(row: EvaluationCardRow): EvaluationCard {
  return {
    childName: `${row.student.firstName} ${row.student.lastName}`.trim(),
    groupLabel: groupLabel(row),
    kind: row.group.course.kind,
    skills: assessmentSkills(row),
    opisnaOcjena: row.opisnaOcjena,
    recommendationLabel: row.recommendationKind
      ? formatRecommendationLabel(
          row.recommendationKind,
          row.recommendedCourse?.title ?? null,
        )
      : null,
    authorName: `${row.author.firstName} ${row.author.lastName}`.trim(),
    updatedAtLabel: formatDate(row.updatedAt),
  }
}

// ── The ownership guard ──────────────────────────────────────────────────────

/** What {@link assertCardsBelongTo} needs to prove a card may be mailed. */
export type CardOwnership = {
  id: string
  student: { parentEmail: string | null }
  group: { city: City }
}

type OwnershipVerdict = { ok: true } | { ok: false; reason: string }

/**
 * The last line of defence before an evaluation e-mail goes out, and the reason
 * a card cannot reach the wrong parent.
 *
 * A recipient row names the cards it is owed (`assessmentIds`), but that list
 * was written when the cohort was resolved — possibly minutes or a deploy ago.
 * Rather than trust it, the send re-loads those rows and re-derives ownership
 * from the student's CURRENT `parentEmail`: a card ships only if the child it
 * belongs to still lists exactly this recipient's address.
 *
 * Every failure mode therefore ends in "don't send", never "send anyway":
 * a card deleted or re-graded away, a parent's address corrected mid-send, a
 * cohort row that somehow named a card belonging to someone else. The admin
 * sees the reason on the campaign detail page and can re-send deliberately.
 *
 * Pure on purpose — the caller does the query, this decides, so the decision is
 * unit-testable without a database.
 */
export function assertCardsBelongTo(
  expected: { parentEmail: string; city: City; assessmentIds: string[] },
  loaded: CardOwnership[],
): OwnershipVerdict {
  if (expected.assessmentIds.length === 0) {
    return { ok: false, reason: 'Nema evaluacije za slanje.' }
  }

  // Set equality, not just a count: proves the loaded rows are exactly the ones
  // the recipient row named, even if the query that fetched them were wrong.
  const wanted = new Set(expected.assessmentIds)
  const got = new Set(loaded.map((row) => row.id))
  if (wanted.size !== got.size || [...wanted].some((id) => !got.has(id))) {
    return {
      ok: false,
      reason: 'Evaluacija je u međuvremenu izbrisana ili izmijenjena — e-mail nije poslan.',
    }
  }

  for (const row of loaded) {
    if (normalizeParentEmail(row.student.parentEmail) !== expected.parentEmail) {
      // Either the parent's address changed after the cohort was written, or
      // this card never belonged to this address. Both mean: stop.
      return {
        ok: false,
        reason:
          'E-mail adresa roditelja se promijenila nakon pripreme slanja — evaluacija nije poslana.',
      }
    }
    if (row.group.city !== expected.city) {
      return { ok: false, reason: 'Evaluacija pripada drugom gradu — e-mail nije poslan.' }
    }
  }

  return { ok: true }
}
