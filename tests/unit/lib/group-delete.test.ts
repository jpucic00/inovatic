import { describe, expect, it } from 'vitest'
import { openInquiriesPhrase, tallyOpenInquiries } from '@/lib/group-delete'

describe('tallyOpenInquiries', () => {
  it('counts each upit once per group it names', () => {
    const counts = tallyOpenInquiries([
      { scheduledGroupId: 'a', assignedGroupId: null, waitlistGroups: [] },
      { scheduledGroupId: 'a', assignedGroupId: 'a', waitlistGroups: [] },
      { scheduledGroupId: 'a', assignedGroupId: 'b', waitlistGroups: [] },
      { scheduledGroupId: null, assignedGroupId: null, waitlistGroups: [] },
    ])
    expect(Object.fromEntries(counts)).toEqual({ a: 3, b: 1 })
  })

  it('counts a waitlisted upit against every group it waits for, once each', () => {
    const counts = tallyOpenInquiries([
      {
        scheduledGroupId: 'a',
        assignedGroupId: null,
        waitlistGroups: [{ scheduledGroupId: 'a' }, { scheduledGroupId: 'c' }],
      },
    ])
    expect(Object.fromEntries(counts)).toEqual({ a: 1, c: 1 })
  })
})

describe('openInquiriesPhrase', () => {
  it.each([
    [1, '1 neobrađeni upit'],
    [3, '3 neobrađena upita'],
    [5, '5 neobrađenih upita'],
    [12, '12 neobrađenih upita'],
    [21, '21 neobrađeni upit'],
  ])('%i → %s', (n, text) => {
    expect(openInquiriesPhrase(n)).toBe(text)
  })
})
