import { describe, expect, it } from 'vitest'
import {
  hasUnrecordedEntries,
  initAttendanceDraft,
  initTeacherDraft,
  isSessionDirty,
  sessionStatus,
  summarizeSession,
  type DraftRecord,
} from '@/lib/attendance-draft'

const roster = [{ enrollmentId: 'e1' }, { enrollmentId: 'e2' }]

function rec(present: boolean, note: string | null = null, at = '2026-05-12T16:42:00.000Z'): DraftRecord {
  return { present, note, recordedAt: at }
}

const savedAtLabel = (iso: string) => `«${iso}»`

describe('initAttendanceDraft', () => {
  // The whole point of the redesign: an untouched session must not render as a
  // recorded one. A missing row is a question, not a "present".
  it('leaves a student with no record unmarked', () => {
    expect(initAttendanceDraft(roster, undefined)).toEqual({
      e1: { present: false, note: '' },
      e2: { present: false, note: '' },
    })
  })

  it('mirrors an existing record, present or absent, with its note', () => {
    const existing = new Map([
      ['e1', rec(true, 'zakasnio')],
      ['e2', rec(false)],
    ])
    expect(initAttendanceDraft(roster, existing)).toEqual({
      e1: { present: true, note: 'zakasnio' },
      e2: { present: false, note: '' },
    })
  })
})

describe('initTeacherDraft', () => {
  const teachers = [
    { userId: 't1', assigned: true },
    { userId: 't2', assigned: true },
    { userId: 't3', assigned: false },
  ]

  // Deliberately NOT the roster's blank start — an unticked teacher is payout
  // evidence that never gets written, and nobody notices until month end.
  it('defaults assigned teachers to present and skips unassigned ones', () => {
    expect(initTeacherDraft(teachers, undefined)).toEqual({ t1: true, t2: true })
  })

  it('prefers an existing record over the default', () => {
    const existing = new Map([['t2', false]])
    expect(initTeacherDraft(teachers, existing)).toEqual({ t1: true, t2: false })
  })
})

describe('isSessionDirty', () => {
  const clean = {
    roster,
    draft: { e1: { present: false, note: '' }, e2: { present: false, note: '' } },
    existing: undefined,
    teacherDraft: {},
    teacherExisting: undefined,
  }

  it('is false for an untouched, unrecorded session', () => {
    expect(isSessionDirty(clean)).toBe(false)
  })

  it('is true once a box is ticked', () => {
    expect(
      isSessionDirty({
        ...clean,
        draft: { ...clean.draft, e1: { present: true, note: '' } },
      }),
    ).toBe(true)
  })

  it('is true once a note is typed, even with nothing ticked', () => {
    expect(
      isSessionDirty({
        ...clean,
        draft: { ...clean.draft, e2: { present: false, note: 'bolest' } },
      }),
    ).toBe(true)
  })

  // Compared against the record rather than tracked as a "touched" flag, so the
  // "Nespremljene izmjene" banner cannot claim work that was undone.
  it('is false again after a tick is undone', () => {
    const existing = new Map([['e1', rec(true)], ['e2', rec(false)]])
    expect(
      isSessionDirty({
        ...clean,
        existing,
        draft: { e1: { present: true, note: '' }, e2: { present: false, note: '' } },
      }),
    ).toBe(false)
  })

  it('sees a teacher unticked away from the assigned default', () => {
    expect(
      isSessionDirty({ ...clean, teacherDraft: { t1: false } }),
    ).toBe(true)
  })

  it('does not call the assigned default dirty on its own', () => {
    expect(isSessionDirty({ ...clean, teacherDraft: { t1: true } })).toBe(false)
  })

  // Pins the trim-on-compare rule: the save writes `note.trim() || null`, so a
  // raw comparison would read "Nespremljene izmjene" forever after saving.
  it('treats a note differing only by surrounding whitespace as clean', () => {
    const existing = new Map([['e1', rec(true, 'zakasnio')], ['e2', rec(false)]])
    expect(
      isSessionDirty({
        ...clean,
        existing,
        draft: {
          e1: { present: true, note: '  zakasnio  ' },
          e2: { present: false, note: '' },
        },
      }),
    ).toBe(false)
  })

  it('treats a whitespace-only note against no record as clean', () => {
    expect(
      isSessionDirty({
        ...clean,
        draft: { ...clean.draft, e2: { present: false, note: '   ' } },
      }),
    ).toBe(false)
  })
})

describe('hasUnrecordedEntries', () => {
  const teachers = [
    { userId: 't1', assigned: true },
    { userId: 't2', assigned: false },
  ]

  it('is true while nothing at all is recorded', () => {
    expect(
      hasUnrecordedEntries({ roster, existing: undefined, teachers: [], teacherExisting: undefined }),
    ).toBe(true)
  })

  // The case the flag exists for: a student enrolled AFTER the session was
  // saved has no row, rests at the blank baseline, and can never read as an
  // edit — this save is the only way their row gets written.
  it('is true when one roster member has no row on a recorded session', () => {
    const existing = new Map([['e1', rec(true)]])
    expect(
      hasUnrecordedEntries({ roster, existing, teachers: [], teacherExisting: undefined }),
    ).toBe(true)
  })

  it('is false once every member and assigned teacher has a row', () => {
    const existing = new Map([['e1', rec(true)], ['e2', rec(false)]])
    expect(
      hasUnrecordedEntries({
        roster,
        existing,
        teachers,
        teacherExisting: new Map([['t1', true]]),
      }),
    ).toBe(false)
  })

  it('is true for an assigned teacher without a row; unassigned ones are ignored', () => {
    const existing = new Map([['e1', rec(true)], ['e2', rec(false)]])
    expect(
      hasUnrecordedEntries({ roster, existing, teachers, teacherExisting: undefined }),
    ).toBe(true)
    // t2 is unassigned — a historic chip, not bookable work.
    expect(
      hasUnrecordedEntries({
        roster,
        existing,
        teachers: [{ userId: 't2', assigned: false }],
        teacherExisting: undefined,
      }),
    ).toBe(false)
  })
})

describe('summarizeSession', () => {
  it('reports nothing for a session with no rows', () => {
    expect(summarizeSession(roster, undefined)).toEqual({
      recorded: 0,
      present: 0,
      savedAt: null,
    })
  })

  it('counts rows and present separately and keeps the newest timestamp', () => {
    const existing = new Map([
      ['e1', rec(true, null, '2026-05-12T16:00:00.000Z')],
      ['e2', rec(false, null, '2026-05-12T18:30:00.000Z')],
    ])
    expect(summarizeSession(roster, existing)).toEqual({
      recorded: 2,
      present: 1,
      savedAt: '2026-05-12T18:30:00.000Z',
    })
  })

  it('ignores rows belonging to students outside the visible roster', () => {
    const existing = new Map([['other', rec(true)]])
    expect(summarizeSession(roster, existing).recorded).toBe(0)
  })
})

describe('sessionStatus', () => {
  const empty = { recorded: 0, present: 0, savedAt: null }

  it('asks for marks when nothing is recorded', () => {
    const s = sessionStatus({
      dirty: false,
      marked: 0,
      total: 2,
      summary: empty,
      formatSavedAt: savedAtLabel,
    })
    expect(s.tone).toBe('idle')
    expect(s.text).toContain('Nije evidentirano')
  })

  it('reports the saved count and time once recorded', () => {
    const s = sessionStatus({
      dirty: false,
      marked: 1,
      total: 2,
      summary: { recorded: 2, present: 1, savedAt: 'ISO' },
      formatSavedAt: savedAtLabel,
    })
    expect(s.tone).toBe('saved')
    expect(s.text).toBe('Evidentirano · 1 od 2 prisutno · spremljeno «ISO»')
  })

  // Reading back the old timestamp on an edited session would be a lie.
  it('lets unsaved edits outrank an earlier save', () => {
    const s = sessionStatus({
      dirty: true,
      marked: 2,
      total: 2,
      summary: { recorded: 2, present: 1, savedAt: 'ISO' },
      formatSavedAt: savedAtLabel,
    })
    expect(s.tone).toBe('dirty')
    expect(s.text).toBe('Nespremljene izmjene — 2 od 2 označeno')
  })
})
