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
}

export type EmailRecipient = {
  parentEmail: string
  children: EmailRecipientChild[]
}

export type SkippedStudent = {
  studentId: string
  studentName: string
  reason: 'MISSING_EMAIL' | 'INVALID_EMAIL'
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
      byEmail.set(email, { parentEmail: email, children: [child] })
    }
  }

  const recipients = [...byEmail.values()].sort((a, b) =>
    a.parentEmail.localeCompare(b.parentEmail),
  )
  return { recipients, skipped }
}
