import { describe, expect, it } from 'vitest'
import { createLocationSchema } from '@/lib/validators/admin/location'

describe('createLocationSchema', () => {
  it('accepts a minimal valid location', () => {
    const result = createLocationSchema.parse({
      name: 'Centar',
      address: 'Splitska 1',
    })
    expect(result.name).toBe('Centar')
  })

  it('accepts all optional fields', () => {
    const result = createLocationSchema.parse({
      name: 'Centar',
      address: 'Splitska 1',
      phone: '021123456',
      email: 'info@example.com',
    })
    expect(result.name).toBe('Centar')
  })

  it('accepts empty-string phone and email', () => {
    const result = createLocationSchema.parse({
      name: 'Centar',
      address: 'Splitska 1',
      phone: '',
      email: '',
    })
    expect(result.email).toBe('')
  })

  it('rejects name shorter than 2 chars', () => {
    const result = createLocationSchema.safeParse({ name: 'C', address: 'Splitska 1' })
    expect(result.success).toBe(false)
  })

  it('rejects address shorter than 5 chars', () => {
    const result = createLocationSchema.safeParse({ name: 'Centar', address: 'Spl' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email (when non-empty)', () => {
    const result = createLocationSchema.safeParse({
      name: 'Centar',
      address: 'Splitska 1',
      email: 'not-email',
    })
    expect(result.success).toBe(false)
  })
})
