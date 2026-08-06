import { describe, it, expect } from 'vitest'
import { publicSignupPath, signupPathForSlug } from '@/lib/signup-links'

describe('publicSignupPath', () => {
  it('sends the SLR ladder and the competitive program to /prijava/<slug>', () => {
    expect(publicSignupPath('STANDARD', 'slr-2')).toBe('/prijava/slr-2')
    expect(publicSignupPath('COMPETITION', 'natjecateljski-program')).toBe(
      '/prijava/natjecateljski-program',
    )
  })

  // /prijava/[slug] answers notFound() for a radionica: its signups live on its
  // own public page. A copy button that built /prijava/<slug> here handed the
  // admin a 404.
  it('sends a radionica to its own /radionice/<slug> page', () => {
    expect(publicSignupPath('RADIONICA', 'ljetna-radionica-ciklus-1')).toBe(
      '/radionice/ljetna-radionica-ciklus-1',
    )
  })

  it('agrees with signupPathForSlug on everything that has a /prijava page', () => {
    for (const slug of ['uvod-u-svijet-lego-robotike', 'slr-1', 'slr-4']) {
      expect(publicSignupPath('STANDARD', slug)).toBe(signupPathForSlug(slug))
    }
  })
})
