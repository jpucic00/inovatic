import type { City } from '@prisma/client'
import {
  normalizeParentEmail,
  type EmailRecipient,
  type SkippedStudent,
} from '@/lib/bulk-email-recipients'
import type { GroupTermin } from '@/lib/group-termin'

/**
 * One child's groups as the schedule e-mail renders them. A mail carries one
 * card per child on the address — nothing internal (ids) reaches the parent.
 */
export type ScheduleCard = {
  childName: string
  /** Every group the child is enrolled in for the campaign's school year. */
  groups: GroupTermin[]
}

/** One enrolled child — a candidate for a place in exactly one schedule e-mail. */
export type ScheduleCandidate = {
  studentId: string
  firstName: string
  lastName: string
  parentEmail: string | null
  /** Every group of this child in the source year, joined for the composer's row. */
  groupLabel: string
}

/**
 * One recipient row per parent INBOX, siblings merged — the same rule as
 * `buildEmailRecipients` (CUSTOM / REENROLLMENT) and the deliberate opposite of
 * the EVALUATION and CREDENTIALS builders.
 *
 * Those two refuse to merge because their content is a secret: a report card
 * or a password reaching the wrong family is the failure they exist to
 * prevent, and `parentEmail` is not a family identifier. A termin is not a
 * secret — it is the same information the public group feed shows, plus the
 * child's name, which the address already knows. What a parent asking "when
 * do my children come" wants is one answer listing both of them, and the
 * owner asked for exactly that (2026-09-16).
 *
 * The row still names every child it covers in `studentIds`, so the send can
 * re-derive ownership per child before mailing (`assertScheduleBelongsTo`).
 */
export function buildScheduleRecipients(candidates: ScheduleCandidate[]): {
  recipients: EmailRecipient[]
  skipped: SkippedStudent[]
} {
  const byEmail = new Map<string, EmailRecipient>()
  const skipped: SkippedStudent[] = []
  const seenStudents = new Set<string>()

  for (const candidate of candidates) {
    if (seenStudents.has(candidate.studentId)) continue
    seenStudents.add(candidate.studentId)

    const studentName = `${candidate.firstName} ${candidate.lastName}`.trim()
    const email = normalizeParentEmail(candidate.parentEmail)
    if (!email) {
      skipped.push({
        studentId: candidate.studentId,
        studentName,
        reason: candidate.parentEmail?.trim() ? 'INVALID_EMAIL' : 'MISSING_EMAIL',
      })
      continue
    }

    const child = { name: studentName, recommendation: null, groupLabel: candidate.groupLabel }
    const existing = byEmail.get(email)
    if (existing) {
      existing.children.push(child)
      existing.studentIds.push(candidate.studentId)
    } else {
      byEmail.set(email, {
        parentEmail: email,
        children: [child],
        assessmentIds: [],
        studentIds: [candidate.studentId],
        // The inbox: one mail per address, so unchecking a row drops the whole
        // family — which is what unchecking an address means.
        rowKey: email,
      })
    }
  }

  const recipients = [...byEmail.values()].sort((a, b) =>
    a.parentEmail.localeCompare(b.parentEmail),
  )
  return { recipients, skipped }
}

// ── The ownership guard ──────────────────────────────────────────────────────

/** What {@link assertScheduleBelongsTo} needs to prove a child may be listed. */
type ScheduleOwnership = {
  id: string
  parentEmail: string | null
  city: City
  deletedAt: Date | null
}

type OwnershipVerdict = { ok: true } | { ok: false; reason: string }

/**
 * The last check before a schedule e-mail goes out: every child the row names
 * must still belong to this address, in this city, and still exist.
 *
 * Sibling of `assertCredentialsBelongTo`, and the same discipline even though
 * the stakes are lower — the row's `studentIds` were written when the cohort
 * was resolved, possibly a deploy ago, and an address corrected since would
 * otherwise mail one family's children to another. Every failure ends in
 * "don't send": the admin reads the reason on the detail page and re-sends
 * deliberately. Pure on purpose — the caller queries, this decides.
 */
export function assertScheduleBelongsTo(
  expected: { parentEmail: string; city: City; studentIds: string[] },
  loaded: ScheduleOwnership[],
): OwnershipVerdict {
  if (expected.studentIds.length === 0) {
    return { ok: false, reason: 'Nema djece za slanje.' }
  }

  // Set equality, not a count: proves the loaded rows are exactly the ones the
  // recipient row named, even if the query that fetched them were wrong.
  const wanted = new Set(expected.studentIds)
  const got = new Set(loaded.map((row) => row.id))
  if (wanted.size !== got.size || [...wanted].some((id) => !got.has(id))) {
    return {
      ok: false,
      reason: 'Račun djeteta je u međuvremenu izbrisan ili izmijenjen — e-mail nije poslan.',
    }
  }

  for (const row of loaded) {
    if (row.deletedAt) {
      return { ok: false, reason: 'Račun djeteta je izbrisan — e-mail nije poslan.' }
    }
    if (normalizeParentEmail(row.parentEmail) !== expected.parentEmail) {
      // Either the parent's address changed after the cohort was written, or
      // this child never belonged to this address. Both mean: stop.
      return {
        ok: false,
        reason:
          'E-mail adresa roditelja se promijenila nakon pripreme slanja — termini nisu poslani.',
      }
    }
    if (row.city !== expected.city) {
      return { ok: false, reason: 'Račun pripada drugom gradu — e-mail nije poslan.' }
    }
  }

  return { ok: true }
}
