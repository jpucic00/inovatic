/**
 * The marker's draft rules, kept out of the component so they can be tested and
 * so the two branches (standard, flat) cannot answer them differently.
 *
 * The rule that shapes everything here: a checkbox states the teacher's
 * decision, never the state of the database. A session with no `Attendance`
 * rows therefore opens with every box EMPTY — the previous default of
 * `present: true` rendered an untouched session identically to a saved one, so
 * a full column of green said "recorded" about a session nobody had touched.
 * An assigned teacher is the deliberate exception, see `initTeacherDraft`.
 *
 * Types are structural on purpose: the rows come from `'use server'` modules,
 * and depending on those from here would drag an action module into every
 * caller.
 */

interface DraftRosterRow {
  enrollmentId: string
}

export interface DraftRecord {
  present: boolean
  note: string | null
  /** ISO — the marker states the newest one back as "spremljeno …". */
  recordedAt: string
}

interface DraftTeacherRow {
  userId: string
  assigned: boolean
}

export type AttendanceDraft = Record<string, { present: boolean; note: string }>

export type TeacherDraft = Record<string, boolean>

/** Blank unless the session already has a row for that student. */
export function initAttendanceDraft(
  roster: readonly DraftRosterRow[],
  existing: ReadonlyMap<string, DraftRecord> | undefined,
): AttendanceDraft {
  const draft: AttendanceDraft = {}
  for (const r of roster) {
    const rec = existing?.get(r.enrollmentId)
    draft[r.enrollmentId] = {
      present: rec ? rec.present : false,
      note: rec?.note ?? '',
    }
  }
  return draft
}

/**
 * Assigned teachers still default to present — deliberately NOT the blank start
 * the roster gets. The section only renders for a group with 2+ teachers, and
 * the failure modes are not symmetric: an unticked box here is payout evidence
 * that silently never gets written, noticed a month later. The pre-tick is a
 * defensible claim (these are the teachers scheduled to teach the session),
 * which is exactly what the roster's pre-tick was not.
 */
export function initTeacherDraft(
  teachers: readonly DraftTeacherRow[],
  existing: ReadonlyMap<string, boolean> | undefined,
): TeacherDraft {
  const draft: TeacherDraft = {}
  for (const t of teachers) {
    if (!t.assigned) continue
    draft[t.userId] = existing?.get(t.userId) ?? true
  }
  return draft
}

interface SessionDirtyInput {
  roster: readonly DraftRosterRow[]
  draft: AttendanceDraft
  existing: ReadonlyMap<string, DraftRecord> | undefined
  teacherDraft: TeacherDraft
  teacherExisting: ReadonlyMap<string, boolean> | undefined
}

/**
 * True when a draft says something other than what is already recorded.
 *
 * Compared against the record rather than tracked as a "touched" flag, so
 * ticking a box and unticking it again correctly leaves the session clean —
 * "Nespremljene izmjene" has to be true or the banner is just noise. The
 * baseline per row is whatever `initAttendanceDraft` / `initTeacherDraft` would
 * have produced, which is why the teacher arm falls back to `true`.
 */
export function isSessionDirty({
  roster,
  draft,
  existing,
  teacherDraft,
  teacherExisting,
}: SessionDirtyInput): boolean {
  for (const r of roster) {
    const d = draft[r.enrollmentId]
    const rec = existing?.get(r.enrollmentId)
    const basePresent = rec ? rec.present : false
    const baseNote = (rec?.note ?? '').trim()
    if ((d?.present ?? false) !== basePresent) return true
    // Trimmed on both sides because that is what the save writes: a note of
    // pure whitespace stores as null, so comparing raw would leave the session
    // reading "Nespremljene izmjene" forever after it was saved.
    if ((d?.note ?? '').trim() !== baseNote) return true
  }
  for (const [userId, present] of Object.entries(teacherDraft)) {
    if (present !== (teacherExisting?.get(userId) ?? true)) return true
  }
  return false
}

interface SessionSummary {
  /** How many of the roster already have a row for this session. */
  recorded: number
  /** How many of those rows say present. */
  present: number
  /** Newest `recordedAt` among them, or null when nothing is recorded. */
  savedAt: string | null
}

export function summarizeSession(
  roster: readonly DraftRosterRow[],
  existing: ReadonlyMap<string, DraftRecord> | undefined,
): SessionSummary {
  let recorded = 0
  let present = 0
  let savedAt: string | null = null
  for (const r of roster) {
    const rec = existing?.get(r.enrollmentId)
    if (!rec) continue
    recorded += 1
    if (rec.present) present += 1
    if (savedAt === null || rec.recordedAt > savedAt) savedAt = rec.recordedAt
  }
  return { recorded, present, savedAt }
}

export type SessionStatusTone = 'idle' | 'dirty' | 'saved'

export interface SessionStatus {
  tone: SessionStatusTone
  text: string
}

/**
 * The one line that says whether this session is done, since a blank checkbox
 * alone cannot distinguish "not marked yet" from "marked absent".
 *
 * `dirty` wins over `saved`: an edited session that was recorded an hour ago is
 * unsaved work, and reading back the old timestamp would be a lie.
 */
export function sessionStatus(args: {
  dirty: boolean
  marked: number
  total: number
  summary: SessionSummary
  formatSavedAt: (iso: string) => string
}): SessionStatus {
  const { dirty, marked, total, summary, formatSavedAt } = args
  if (dirty) {
    return {
      tone: 'dirty',
      text: `Nespremljene izmjene — ${marked} od ${total} označeno`,
    }
  }
  if (summary.recorded > 0 && summary.savedAt) {
    return {
      tone: 'saved',
      text: `Evidentirano · ${summary.present} od ${total} prisutno · spremljeno ${formatSavedAt(summary.savedAt)}`,
    }
  }
  return { tone: 'idle', text: 'Nije evidentirano — označite prisutne polaznike' }
}
