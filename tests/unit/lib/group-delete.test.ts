import { describe, expect, it } from 'vitest'
import { openInquiriesPhrase, tallyOpenInquiries } from '@/lib/group-delete'

describe('tallyOpenInquiries', () => {
  it('counts each upit once per group it names', () => {
    const counts = tallyOpenInquiries([
      { scheduledGroupId: 'a', assignedGroupId: null },
      { scheduledGroupId: 'a', assignedGroupId: 'a' },
      { scheduledGroupId: 'a', assignedGroupId: 'b' },
      { scheduledGroupId: null, assignedGroupId: null },
    ])
    expect(Object.fromEntries(counts)).toEqual({ a: 3, b: 1 })
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
