import { describe, expect, it } from 'vitest'
import { pickExactEmail } from '@/lib/email-lookup'

describe('pickExactEmail', () => {
  const rows = [{ email: 'ivanxhorvat@x.hr' }, { email: 'Ivan_Horvat@x.hr' }]

  it('picks the whole-address match, ignoring letter case', () => {
    expect(pickExactEmail(rows, 'ivan_horvat@X.HR')).toBe(rows[1])
  })

  it('never takes a row the ILIKE pattern matched only through "_"', () => {
    expect(pickExactEmail([{ email: 'ivana@x.hr' }], '_vana@x.hr')).toBeNull()
  })
})
