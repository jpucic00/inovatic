import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { hashPassword } from '@/lib/password'

describe('hashPassword', () => {
  it('round-trips with bcryptjs.compare', async () => {
    const pw = 'mySecret123'
    const hash = await hashPassword(pw)
    expect(await bcrypt.compare(pw, hash)).toBe(true)
  })

  it('rejects a wrong password against the hash', async () => {
    const hash = await hashPassword('correct')
    expect(await bcrypt.compare('wrong', hash)).toBe(false)
  })

  it('produces a bcrypt-format hash ($2a$ / $2b$, length 60)', async () => {
    const hash = await hashPassword('x')
    expect(hash).toMatch(/^\$2[aby]\$/)
    expect(hash).toHaveLength(60)
  })

  it('produces a different hash each call (random salt)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
    expect(await bcrypt.compare('same', h1)).toBe(true)
    expect(await bcrypt.compare('same', h2)).toBe(true)
  })
})
