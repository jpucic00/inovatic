export type EmailRecipientStudent = {
  id: string
  firstName: string
  lastName: string
  parentEmail: string | null
  /** Display label of the child's source-year preporuka (invitation cohorts only). */
  recommendation?: string | null
}

export type EmailRecipientChild = {
  name: string
  recommendation: string | null
  /**
   * EVALUATION: which group's report card this row carries.
   * CREDENTIALS: every current group of this child.
   */
  groupLabel?: string
  /** EVALUATION only: false when some skill in the group's rubric is still ungraded. */
  complete?: boolean
  /** CREDENTIALS only: the account has no usable password and one will be minted. */
  needsPassword?: boolean
  /** CREDENTIALS only: a previous campaign already mailed working details. */
  alreadySent?: boolean
}

export type EmailRecipient = {
  parentEmail: string
  children: EmailRecipientChild[]
  /**
   * EVALUATION only: the report card(s) this row is mailed. Empty for the other
   * kinds, whose content is identical for every recipient and therefore lives on
   * the campaign instead.
   */
  assessmentIds: string[]
  /**
   * CREDENTIALS only: the child account this row is mailed — always exactly one.
   * Empty for every other kind.
   */
  studentIds: string[]
  /**
   * What identifies this row in the composer and in the exclusion set: the
   * parent inbox for CUSTOM/REENROLLMENT (one row per inbox), the individual
   * report card for EVALUATION (one row per card, so siblings on one address
   * are two independent rows and unchecking one cannot drop the other), and the
   * child ACCOUNT for CREDENTIALS (one row per account — not per enrollment, so
   * a child in two selected groups is a single mail listing both).
   */
  rowKey: string
}

export type SkippedStudent = {
  studentId: string
  studentName: string
  /** `NOT_GRADED`: EVALUATION only — the child has no filled-in report card. */
  reason: 'MISSING_EMAIL' | 'INVALID_EMAIL' | 'NOT_GRADED'
}

/** Why a child was skipped, in the words the admin reads. */
export const SKIP_REASON_TEXT: Record<SkippedStudent['reason'], string> = {
  MISSING_EMAIL: 'Roditelj nema upisanu e-mail adresu.',
  INVALID_EMAIL: 'E-mail adresa roditelja nije ispravna.',
  NOT_GRADED: 'Dijete nema ispunjenu evaluaciju.',
}

/** The same three, condensed for the composer's skipped list. */
export const SKIP_REASON_SHORT: Record<SkippedStudent['reason'], string> = {
  MISSING_EMAIL: 'nema e-mail',
  INVALID_EMAIL: 'neispravan e-mail',
  NOT_GRADED: 'nema evaluaciju',
}

// Deliberately pragmatic: catches empty/garbage values without rejecting the
// long tail of real-world addresses a strict RFC regex would.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Normalize a stored parent email to a mailable addr-spec, or null when
 * unusable. Handles the `"Name <a@b>"` Outlook-style residue older
 * history-workbook imports left in `User.parentEmail`.
 */
export function normalizeParentEmail(raw: string | null): string | null {
  if (!raw) return null
  let value = raw.trim()
  const angled = /<([^<>]*)>/.exec(value)
  if (angled) value = angled[1].trim()
  value = value.toLowerCase()
  return EMAIL_RE.test(value) ? value : null
}

/**
 * Group students into one recipient per parent inbox (siblings share an
 * email), splitting off students whose parentEmail is missing or unusable so
 * the admin sees exactly who a campaign cannot reach. Duplicate student rows
 * (a child with two enrollments in the cohort) collapse by id.
 */
export function buildEmailRecipients(students: EmailRecipientStudent[]): {
  recipients: EmailRecipient[]
  skipped: SkippedStudent[]
} {
  const byEmail = new Map<string, EmailRecipient>()
  const skipped: SkippedStudent[] = []
  const seenIds = new Set<string>()

  for (const student of students) {
    if (seenIds.has(student.id)) continue
    seenIds.add(student.id)

    const studentName = `${student.firstName} ${student.lastName}`.trim()
    const email = normalizeParentEmail(student.parentEmail)
    if (!email) {
      skipped.push({
        studentId: student.id,
        studentName,
        reason: student.parentEmail?.trim() ? 'INVALID_EMAIL' : 'MISSING_EMAIL',
      })
      continue
    }

    const child = { name: studentName, recommendation: student.recommendation ?? null }
    const existing = byEmail.get(email)
    if (existing) {
      existing.children.push(child)
    } else {
      byEmail.set(email, {
        parentEmail: email,
        children: [child],
        assessmentIds: [],
        studentIds: [],
        rowKey: email,
      })
    }
  }

  const recipients = [...byEmail.values()].sort((a, b) =>
    a.parentEmail.localeCompare(b.parentEmail),
  )
  return { recipients, skipped }
}

/** One graded child in one group — a candidate for exactly one evaluation e-mail. */
export type EvaluationCandidate = {
  assessmentId: string
  studentId: string
  firstName: string
  lastName: string
  parentEmail: string | null
  groupLabel: string
  complete: boolean
}

/**
 * One recipient row per REPORT CARD — the deliberate opposite of
 * {@link buildEmailRecipients}, which merges siblings into a single mail.
 *
 * Merging would mean an inbox receiving a mail about two children, and the
 * merge key (`parentEmail`) is not a family identifier: nothing stops two
 * unrelated children carrying the same address — a mistyped one, a shared
 * institutional one, an import artifact — and the ownership guard cannot tell
 * that case apart from real siblings, because both cards genuinely belong to
 * that address.
 *
 * So evaluations do not merge. Every mail carries exactly one card, which makes
 * "another family's evaluation in my inbox" impossible by construction rather
 * than merely checked. A parent with two children receives two mails, each
 * naming its child in the subject.
 */
export function buildEvaluationRecipients(candidates: EvaluationCandidate[]): {
  recipients: EmailRecipient[]
  skipped: SkippedStudent[]
} {
  const recipients: EmailRecipient[] = []
  const skipped: SkippedStudent[] = []
  const seenCards = new Set<string>()

  for (const candidate of candidates) {
    if (seenCards.has(candidate.assessmentId)) continue
    seenCards.add(candidate.assessmentId)

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

    recipients.push({
      parentEmail: email,
      children: [
        {
          name: studentName,
          recommendation: null,
          groupLabel: candidate.groupLabel,
          complete: candidate.complete,
        },
      ],
      assessmentIds: [candidate.assessmentId],
      studentIds: [],
      // The card, not the inbox — see `rowKey`.
      rowKey: candidate.assessmentId,
    })
  }

  // By child, then group: the composer's list is read as "have all my kids been
  // covered?", which an e-mail-alphabetical order answers poorly.
  recipients.sort(
    (a, b) =>
      a.children[0].name.localeCompare(b.children[0].name, 'hr') ||
      (a.children[0].groupLabel ?? '').localeCompare(b.children[0].groupLabel ?? '', 'hr'),
  )
  return { recipients, skipped }
}

/** One child ACCOUNT — a candidate for exactly one credentials e-mail. */
export type CredentialsCandidate = {
  studentId: string
  firstName: string
  lastName: string
  parentEmail: string | null
  /** Every current group of this child, joined for the composer's row. */
  groupLabel: string
  /** True when the account has no usable password yet and one will be minted. */
  needsPassword: boolean
  /** True when a CREDENTIALS campaign has already mailed working details. */
  alreadySent: boolean
}

/**
 * One recipient row per child ACCOUNT — same non-merging rule as
 * {@link buildEvaluationRecipients}, for a stronger reason.
 *
 * Two siblings on one address have two different usernames and two different
 * passwords, so a merged mail would be a single message carrying two people's
 * login secrets. The merge key (`parentEmail`) is not a family identifier — a
 * mistyped, shared or institutional address is indistinguishable from real
 * siblings at the data level — and where a leaked report card is embarrassing, a
 * leaked login is account takeover of a minor's portal account.
 *
 * The unit is the ACCOUNT, not the enrollment: a password is an account fact, so
 * a child in two selected groups is still exactly one mail, listing both groups.
 * That is the one place this differs from the evaluation builder, where a child
 * in two groups legitimately has two separate documents to send.
 */
export function buildCredentialsRecipients(candidates: CredentialsCandidate[]): {
  recipients: EmailRecipient[]
  skipped: SkippedStudent[]
} {
  const recipients: EmailRecipient[] = []
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

    recipients.push({
      parentEmail: email,
      children: [
        {
          name: studentName,
          recommendation: null,
          groupLabel: candidate.groupLabel,
          needsPassword: candidate.needsPassword,
          alreadySent: candidate.alreadySent,
        },
      ],
      assessmentIds: [],
      studentIds: [candidate.studentId],
      // The account, not the inbox and not the enrollment — see `rowKey`.
      rowKey: candidate.studentId,
    })
  }

  recipients.sort((a, b) => a.children[0].name.localeCompare(b.children[0].name, 'hr'))
  return { recipients, skipped }
}
