import { describe, expect, it } from 'vitest'
import {
  CONSENT_FILTER_VALUES,
  consentEnrollmentWhere,
  consentRestrictions,
  parseConsentFilter,
  PHOTO_CONSENT_KEYS,
  strictestConsents,
  type EnrollmentConsents,
} from '@/lib/enrollment-consent'

const ALL_GIVEN: EnrollmentConsents = {
  consentGallery: true,
  consentWebsite: true,
  consentSocial: true,
  consentEmail: true,
}

describe('consentRestrictions', () => {
  it('is empty when every consent is Da', () => {
    expect(consentRestrictions(ALL_GIVEN)).toEqual({ denied: [], missing: [] })
  })

  it('separates a refusal from a form not entered yet — both restrict', () => {
    expect(
      consentRestrictions({ ...ALL_GIVEN, consentWebsite: false, consentSocial: null }),
    ).toEqual({ denied: ['consentWebsite'], missing: ['consentSocial'] })
  })

  it('looks only at the photo consents when asked to — e-pošta does not stop a photo', () => {
    expect(
      consentRestrictions({ ...ALL_GIVEN, consentEmail: false }, PHOTO_CONSENT_KEYS),
    ).toEqual({ denied: [], missing: [] })
  })
})

describe('strictestConsents', () => {
  it('lets Ne beat nije-uneseno beat Da, per consent', () => {
    expect(
      strictestConsents([
        { ...ALL_GIVEN, consentGallery: null },
        { ...ALL_GIVEN, consentGallery: false, consentWebsite: null },
      ]),
    ).toEqual({
      consentGallery: false,
      consentWebsite: null,
      consentSocial: true,
      consentEmail: true,
    })
  })

  it('reads no enrollments as nothing entered, never as a yes', () => {
    expect(strictestConsents([])).toEqual({
      consentGallery: null,
      consentWebsite: null,
      consentSocial: null,
      consentEmail: null,
    })
  })
})

describe('consent filter', () => {
  it('parses only known values', () => {
    for (const v of CONSENT_FILTER_VALUES) expect(parseConsentFilter(v)).toBe(v)
    expect(parseConsentFilter('nope')).toBeUndefined()
    expect(parseConsentFilter(undefined)).toBeUndefined()
  })

  // Prisma's `{ not: true }` follows SQL and drops NULLs, which would quietly
  // hide every unentered form from "bez privole".
  it('matches a missing answer as withheld, explicitly rather than through `not`', () => {
    expect(consentEnrollmentWhere('NO_SOCIAL')).toEqual({
      OR: [{ consentSocial: false }, { consentSocial: null }],
    })
  })
})
