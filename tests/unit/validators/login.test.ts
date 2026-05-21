import { describe, expect, it } from 'vitest'
import { loginSchema } from '@/lib/validators/login'

describe('loginSchema', () => {
  it('accepts a valid identifier + password', () => {
    const result = loginSchema.parse({ identifier: 'admin', password: 'secret' })
    expect(result).toEqual({ identifier: 'admin', password: 'secret' })
  })

  it('accepts an email as identifier', () => {
    const result = loginSchema.parse({ identifier: 'user@example.com', password: 'pw' })
    expect(result.identifier).toBe('user@example.com')
  })

  it('rejects empty identifier with Croatian message', () => {
    const result = loginSchema.safeParse({ identifier: '', password: 'pw' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'identifier')
      expect(issue?.message).toBe('Unesite korisničko ime ili e-mail')
    }
  })

  it('rejects empty password with Croatian message', () => {
    const result = loginSchema.safeParse({ identifier: 'admin', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'password')
      expect(issue?.message).toBe('Unesite lozinku')
    }
  })

  it('rejects when both fields missing', () => {
    const result = loginSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toHaveLength(2)
    }
  })
})
