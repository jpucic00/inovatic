import { describe, expect, it } from 'vitest'
import {
  addSessionStaffChangeSchema,
  setAssignmentRoleSchema,
} from '@/lib/validators/admin/session-staff'

const base = {
  scheduledGroupId: 'grp-1',
  sessionDates: ['2026-10-13'],
  userId: 'usr-1',
  role: 'LEAD',
  replacesUserId: 'usr-2',
}

function messagesFor(input: Record<string, unknown>, path: string): string[] {
  const result = addSessionStaffChangeSchema.safeParse(input)
  if (result.success) return []
  return result.error.issues
    .filter((i) => i.path[0] === path)
    .map((i) => i.message)
}

// `count` distinct valid date keys, one a day from 2026-10-01.
function distinctDates(count: number): string[] {
  const start = Date.UTC(2026, 9, 1)
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )
}

describe('addSessionStaffChangeSchema', () => {
  it('accepts a valid zamjena and passes the ids through', () => {
    const result = addSessionStaffChangeSchema.parse(base)
    expect(result).toEqual({
      scheduledGroupId: 'grp-1',
      sessionDates: ['2026-10-13'],
      userId: 'usr-1',
      role: 'LEAD',
      replacesUserId: 'usr-2',
    })
  })

  it('dedupes and sorts sessionDates', () => {
    const result = addSessionStaffChangeSchema.parse({
      ...base,
      sessionDates: ['2026-10-20', '2026-10-13', '2026-10-20'],
    })
    expect(result.sessionDates).toEqual(['2026-10-13', '2026-10-20'])
  })

  it('sorts across a month and year boundary', () => {
    const result = addSessionStaffChangeSchema.parse({
      ...base,
      sessionDates: ['2027-01-05', '2026-12-29', '2026-11-03'],
    })
    expect(result.sessionDates).toEqual(['2026-11-03', '2026-12-29', '2027-01-05'])
  })

  it('rejects an empty sessionDates array with its message', () => {
    expect(messagesFor({ ...base, sessionDates: [] }, 'sessionDates')).toEqual([
      'Odaberite barem jedan termin.',
    ])
  })

  it('accepts exactly 60 dates', () => {
    const dates = distinctDates(60)
    const result = addSessionStaffChangeSchema.parse({ ...base, sessionDates: dates })
    expect(result.sessionDates).toHaveLength(60)
  })

  it('rejects 61 dates with its message', () => {
    expect(
      messagesFor({ ...base, sessionDates: distinctDates(61) }, 'sessionDates'),
    ).toEqual(['Previše termina odjednom.'])
  })

  it('rejects a missing sessionDates', () => {
    const { sessionDates: _omit, ...rest } = base
    expect(addSessionStaffChangeSchema.safeParse(rest).success).toBe(false)
  })

  it.each(['2026-1-5', '2026-10-5', '26-10-13', '2026/10/13', '2026-10-13T00:00', ''])(
    'rejects malformed date key %j',
    (bad) => {
      expect(
        addSessionStaffChangeSchema.safeParse({
          ...base,
          sessionDates: ['2026-10-13', bad],
        }).success,
      ).toBe(false)
    },
  )

  it("maps replacesUserId '' to null (Dodatno na terminu)", () => {
    expect(
      addSessionStaffChangeSchema.parse({ ...base, replacesUserId: '' }).replacesUserId,
    ).toBeNull()
  })

  it('maps a missing replacesUserId to null', () => {
    const { replacesUserId: _omit, ...rest } = base
    expect(addSessionStaffChangeSchema.parse(rest).replacesUserId).toBeNull()
  })

  it('accepts an explicit null replacesUserId', () => {
    expect(
      addSessionStaffChangeSchema.parse({ ...base, replacesUserId: null }).replacesUserId,
    ).toBeNull()
  })

  it('rejects an empty userId with its message', () => {
    expect(messagesFor({ ...base, userId: '' }, 'userId')).toEqual([
      'Odaberite nastavnika.',
    ])
  })

  it.each(['LEAD', 'ASSISTANT'])('accepts role %s', (role) => {
    expect(addSessionStaffChangeSchema.parse({ ...base, role }).role).toBe(role)
  })

  it.each(['TEACHER', 'lead', '', undefined])('rejects role %j with its message', (role) => {
    expect(messagesFor({ ...base, role }, 'role')).toEqual(['Odaberite ulogu.'])
  })

  it('rejects an empty or missing scheduledGroupId', () => {
    expect(
      addSessionStaffChangeSchema.safeParse({ ...base, scheduledGroupId: '' }).success,
    ).toBe(false)
    const { scheduledGroupId: _omit, ...rest } = base
    expect(addSessionStaffChangeSchema.safeParse(rest).success).toBe(false)
  })
})

describe('setAssignmentRoleSchema', () => {
  it.each(['LEAD', 'ASSISTANT'])('accepts role %s', (role) => {
    expect(setAssignmentRoleSchema.parse({ assignmentId: 'a-1', role })).toEqual({
      assignmentId: 'a-1',
      role,
    })
  })

  it('rejects an unknown role with its message', () => {
    const result = setAssignmentRoleSchema.safeParse({ assignmentId: 'a-1', role: 'ADMIN' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe('Odaberite ulogu.')
  })

  it('rejects an empty assignmentId', () => {
    expect(
      setAssignmentRoleSchema.safeParse({ assignmentId: '', role: 'LEAD' }).success,
    ).toBe(false)
  })
})
