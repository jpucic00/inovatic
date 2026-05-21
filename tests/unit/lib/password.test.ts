import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { generateSimplePassword, hashPassword } from '@/lib/password'

const ALLOWED = 'abcdefghkmnpqrstuvwxyz23456789'
const AMBIGUOUS = ['i', 'j', 'l', 'o', '0', '1']

describe('generateSimplePassword', () => {
  it('respects default length of 6', () => {
    expect(generateSimplePassword()).toHaveLength(6)
  })

  it('respects custom length', () => {
    expect(generateSimplePassword(10)).toHaveLength(10)
    expect(generateSimplePassword(1)).toHaveLength(1)
    expect(generateSimplePassword(20)).toHaveLength(20)
  })

  it('returns only characters from the allowed charset', () => {
    for (let i = 0; i < 100; i++) {
      const pw = generateSimplePassword(8)
      for (const c of pw) {
        expect(ALLOWED).toContain(c)
      }
    }
  })

  it('never emits ambiguous characters (i, j, l, o, 0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSimplePassword(12)
      for (const bad of AMBIGUOUS) {
        expect(pw).not.toContain(bad)
      }
    }
  })

  it('produces different passwords on consecutive calls (statistically)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      seen.add(generateSimplePassword(8))
    }
    // 50 random 8-char passwords from a 30-char alphabet should virtually
    // never collide; require at least 40 unique to leave headroom.
    expect(seen.size).toBeGreaterThanOrEqual(40)
  })
})

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
